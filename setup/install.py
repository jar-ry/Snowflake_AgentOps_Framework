"""
install.py - Modular installer for the AgentOps framework.

Reads modules.yaml (the module manifest) and config/environments.yaml (via
evaluation/utils) to install a selected subset of framework capabilities into
a single Snowflake schema. Resolves dependencies, orders SQL execution, and
supports selective uninstall.

Modules (capability-level):
    core         schema + observability views            (always installed)
    evaluation   eval tables + accuracy view + CI/CD assets
    monitoring   monitoring tables + trend/quality views
    alerts       Snowflake alerts on regressions          (needs monitoring)
    automation   scheduled aggregation tasks              (needs monitoring)
    dashboard    Next.js App Runtime dashboard            (needs monitoring)

Usage:
    python setup/install.py --modules monitoring,dashboard
    python setup/install.py --modules all
    python setup/install.py --modules alerts,automation --dry-run
    python setup/install.py --uninstall --modules alerts
    python setup/install.py --uninstall --modules monitoring --cascade
    python setup/install.py --list

The set of installed modules is recorded in .agentops-installed.yaml at the
repo root so `configure` / uninstall know current state.
"""
import argparse
import os
import sys

import yaml

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST_PATH = os.path.join(PROJECT_ROOT, "modules.yaml")
STATE_PATH = os.path.join(PROJECT_ROOT, ".agentops-installed.yaml")

sys.path.insert(0, os.path.join(PROJECT_ROOT, "evaluation"))
from utils import get_framework_config, get_connection  # noqa: E402


# ---------------------------------------------------------------------------
# Manifest + state
# ---------------------------------------------------------------------------

def load_manifest() -> dict:
    with open(MANIFEST_PATH) as f:
        return (yaml.safe_load(f) or {}).get("modules", {})


def load_state() -> dict:
    if os.path.exists(STATE_PATH):
        with open(STATE_PATH) as f:
            return yaml.safe_load(f) or {}
    return {}


def save_state(state: dict) -> None:
    with open(STATE_PATH, "w") as f:
        yaml.safe_dump(state, f, sort_keys=False, default_flow_style=False)


# ---------------------------------------------------------------------------
# Dependency resolution
# ---------------------------------------------------------------------------

def all_module_names(manifest: dict) -> list:
    return list(manifest.keys())


def required_modules(manifest: dict) -> set:
    return {name for name, m in manifest.items() if m.get("required")}


def _ordering_deps(manifest: dict, name: str, selected: set) -> list:
    """Modules that must be installed before `name`: its declared depends_on,
    plus any module referenced by a conditional SQL file's `requires` when that
    module is part of the selected set (e.g. the accuracy-regression alert file
    requires evaluation's view to exist first)."""
    deps = list(manifest.get(name, {}).get("depends_on", []))
    for entry in manifest.get(name, {}).get("sql", []) or []:
        if isinstance(entry, dict):
            for req in entry.get("requires", []):
                if req in selected and req not in deps:
                    deps.append(req)
    return deps


def resolve_dependencies(manifest: dict, requested: set) -> list:
    """Expand `requested` to include all transitive depends_on and always-required
    modules, then return them in dependency (install) order via topological sort."""
    selected = set(requested) | required_modules(manifest)

    # Expand transitive dependencies.
    changed = True
    while changed:
        changed = False
        for name in list(selected):
            for dep in manifest.get(name, {}).get("depends_on", []):
                if dep not in selected:
                    selected.add(dep)
                    changed = True

    # Topological sort (Kahn) over dependency edges (declared + conditional).
    ordered, visited, visiting = [], set(), set()

    def visit(name):
        if name in visited:
            return
        if name in visiting:
            sys.exit(f"ERROR: dependency cycle detected at module '{name}'")
        visiting.add(name)
        for dep in _ordering_deps(manifest, name, selected):
            if dep in selected:
                visit(dep)
        visiting.discard(name)
        visited.add(name)
        ordered.append(name)

    for name in selected:
        visit(name)
    return ordered


def parse_modules_arg(manifest: dict, arg: str) -> set:
    if arg.strip().lower() == "all":
        return set(manifest.keys())
    names = {n.strip() for n in arg.split(",") if n.strip()}
    unknown = names - set(manifest.keys())
    if unknown:
        sys.exit(
            f"ERROR: unknown module(s): {', '.join(sorted(unknown))}\n"
            f"  Available: {', '.join(manifest.keys())}"
        )
    return names


# ---------------------------------------------------------------------------
# SQL rendering + execution
# ---------------------------------------------------------------------------

def render_sql(raw: str, fw: dict) -> str:
    return (
        raw.replace("{{FRAMEWORK_DB}}", fw["database"])
        .replace("{{FRAMEWORK_SCHEMA}}", fw["schema"])
        .replace("{{WAREHOUSE}}", fw.get("warehouse", ""))
    )


def run_sql(cursor, sql: str) -> None:
    """Execute one SQL statement through the Snowflake connector.

    We use the connector (not `snow sql -q`) because the CLI splits input on
    `;` client-side, which corrupts multi-statement task bodies
    (CREATE TASK ... AS BEGIN ...; ...; END;). cursor.execute() sends the whole
    statement to the server intact.
    """
    cursor.execute(sql)


def split_statements(sql_text: str) -> list:
    """Split a rendered SQL file into individual statements.

    Naive `;` splitting breaks multi-statement task bodies (BEGIN ... END; with
    inner semicolons). We keep those intact by tracking BEGIN/END depth.
    """
    statements, buf, depth = [], [], 0
    for raw_line in sql_text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("--"):
            # keep comment lines attached to the current buffer for readability
            buf.append(raw_line)
            continue
        upper = stripped.upper()
        # Track BEGIN/END nesting so semicolons inside a task body don't split.
        if upper == "BEGIN":
            depth += 1
        buf.append(raw_line)
        # A statement ends on a semicolon only when not inside a BEGIN block,
        # OR when the line is exactly 'END;' closing the block.
        if stripped.endswith(";"):
            if upper.startswith("END;") or upper == "END;":
                depth = max(0, depth - 1)
                if depth == 0:
                    statements.append("\n".join(buf).strip())
                    buf = []
            elif depth == 0:
                statements.append("\n".join(buf).strip())
                buf = []
    tail = "\n".join(buf).strip()
    if tail:
        statements.append(tail)
    # Drop pure-comment / empty fragments.
    return [s for s in statements if s and not _is_only_comments(s)]


def _is_only_comments(stmt: str) -> bool:
    for line in stmt.splitlines():
        s = line.strip()
        if s and not s.startswith("--"):
            return False
    return True


def sql_entries_for(module: dict, selected: set) -> list:
    """Return SQL file paths for a module, honoring per-file `requires`."""
    paths = []
    for entry in module.get("sql", []) or []:
        if isinstance(entry, str):
            paths.append(entry)
        elif isinstance(entry, dict):
            requires = set(entry.get("requires", []))
            if requires.issubset(selected):
                paths.append(entry["path"])
    return paths


# ---------------------------------------------------------------------------
# Install / uninstall
# ---------------------------------------------------------------------------

def install(manifest, order, selected, fw, dry_run, cursor):
    for name in order:
        module = manifest[name]
        files = sql_entries_for(module, selected)
        print(f"\n[{name}] {module.get('title', name)}")
        if module.get("requires_warehouse") and not fw.get("warehouse") and not dry_run:
            sys.exit(f"ERROR: module '{name}' needs framework.warehouse in config/environments.yaml")
        if not files and not module.get("app_dir"):
            print("  (no SQL objects)")
        for rel in files:
            path = os.path.join(PROJECT_ROOT, rel)
            if not os.path.exists(path):
                sys.exit(f"ERROR: SQL file not found: {rel}")
            with open(path) as f:
                rendered = render_sql(f.read(), fw)
            stmts = split_statements(rendered)
            print(f"  {rel}  ({len(stmts)} statement(s))")
            for stmt in stmts:
                if dry_run:
                    first = stmt.splitlines()[0][:80] if stmt.splitlines() else stmt[:80]
                    print(f"      would run: {first} ...")
                else:
                    run_sql(cursor, stmt)
        if module.get("app_dir"):
            print(f"  app: {module['app_dir']} (deploy separately with `snow app deploy`)")


def uninstall(manifest, order, fw, dry_run, cascade, requested, cursor):
    # Uninstall in reverse install order (dependents first).
    for name in reversed(order):
        if name not in requested:
            continue
        module = manifest[name]
        if module.get("required") and not cascade:
            print(f"[{name}] required module - skipping (use --cascade to force)")
            continue
        # Block removing a module others still depend on unless --cascade.
        dependents = [
            other for other in manifest
            if name in manifest[other].get("depends_on", []) and other not in requested
        ]
        if dependents and not cascade:
            sys.exit(
                f"ERROR: cannot uninstall '{name}' - still required by: {', '.join(dependents)}.\n"
                f"  Re-run with --cascade or uninstall those first."
            )
        print(f"\n[{name}] dropping {len(module.get('drops', []))} object(s)")
        for obj in module.get("drops", []):
            fqn = f"{fw['database']}.{fw['schema']}.{obj['name']}"
            stmt = f"DROP {obj['type']} IF EXISTS {fqn}"
            if dry_run:
                print(f"      would run: {stmt}")
            else:
                run_sql(cursor, stmt)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _resolve_framework_config(dry_run: bool) -> dict:
    """Load framework db/schema/warehouse from config. In dry-run, tolerate a
    missing config so the module graph can be inspected before bootstrapping."""
    try:
        return get_framework_config()
    except FileNotFoundError:
        if dry_run:
            return {"database": "{{FRAMEWORK_DB}}", "schema": "{{FRAMEWORK_SCHEMA}}", "warehouse": "{{WAREHOUSE}}"}
        raise


def cmd_list(manifest):
    print("Available modules:\n")
    for name, m in manifest.items():
        deps = ", ".join(m.get("depends_on", [])) or "-"
        tag = " (always installed)" if m.get("required") else ""
        print(f"  {name:12s}{tag}")
        print(f"      {m.get('description', '').strip()}")
        print(f"      depends_on: {deps}")
    state = load_state()
    if state.get("modules"):
        print(f"\nCurrently installed: {', '.join(state['modules'])}")


def main():
    parser = argparse.ArgumentParser(description="Install AgentOps framework modules.")
    parser.add_argument("--modules", help="Comma-separated module names, or 'all'.")
    parser.add_argument("--uninstall", action="store_true", help="Drop the selected modules' objects.")
    parser.add_argument("--cascade", action="store_true", help="Allow uninstalling modules others depend on.")
    parser.add_argument("--dry-run", action="store_true", help="Print actions without executing.")
    parser.add_argument("--list", action="store_true", help="List modules and current install state.")
    args = parser.parse_args()

    manifest = load_manifest()

    if args.list:
        cmd_list(manifest)
        return

    if not args.modules:
        sys.exit("ERROR: --modules is required (or use --list). Example: --modules monitoring,dashboard")

    fw = _resolve_framework_config(args.dry_run)
    if not args.dry_run and (not fw.get("database") or not fw.get("schema")):
        sys.exit("ERROR: framework.database / framework.schema not set in config/environments.yaml")

    requested = parse_modules_arg(manifest, args.modules)
    order = resolve_dependencies(manifest, requested)

    print(f"{'='*64}")
    print(f"  {'DRY RUN - ' if args.dry_run else ''}{'Uninstall' if args.uninstall else 'Install'}")
    print(f"  Target:    {fw.get('database', '?')}.{fw.get('schema', '?')}")
    print(f"  Requested: {', '.join(sorted(requested))}")
    print(f"  Resolved:  {', '.join(order)}  (with dependencies)")
    print(f"{'='*64}")

    state = load_state()
    installed = set(state.get("modules", []))

    conn = None if args.dry_run else get_connection(set_context=False)
    cursor = conn.cursor() if conn else None
    try:
        if args.uninstall:
            uninstall(manifest, order, fw, args.dry_run, args.cascade, requested, cursor)
            if not args.dry_run:
                installed -= requested
                save_state({"modules": sorted(installed)})
        else:
            install(manifest, order, set(order), fw, args.dry_run, cursor)
            if not args.dry_run:
                installed |= set(order)
                save_state({"modules": sorted(installed)})
    finally:
        if conn:
            conn.close()

    if not args.dry_run:
        print(f"\nDone. Installed modules: {', '.join(sorted(installed)) or '(none)'}")
    else:
        print("\nDry run complete - no changes made.")


if __name__ == "__main__":
    main()
