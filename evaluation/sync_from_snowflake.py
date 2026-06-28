"""
sync_from_snowflake.py — Capture live object definitions from Snowflake into the repo.

This is the inverse of setup/deploy.py. It pulls the CURRENT definition of each
governed semantic view and agent out of Snowflake and writes it to the repo as a
.yaml file — closing the Snowsight -> git loop. After a developer edits an object
in Snowsight, run this to bring that change into git as a committable diff.

Semantic views: SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW (native, lossless YAML).
Agents:         DESCRIBE AGENT -> agent_spec (JSON) -> YAML (pure spec, no wrapper).

Files match the naming deploy.py expects:
    semantic_views/<short_name>.yaml
    agents/<short_name>.yaml

Usage:
    python evaluation/sync_from_snowflake.py --environment dev
    python evaluation/sync_from_snowflake.py --environment dev --dry-run
    python evaluation/sync_from_snowflake.py --environment dev --target agent
    python evaluation/sync_from_snowflake.py --environment dev --check   # CI drift guard

--check is the CI drift guard (issue #22): it compares each live object against
its committed .yaml WITHOUT writing, and exits 1 if any object has drifted (was
edited in Snowsight but never captured). Because the comparison reuses the exact
serialization that capture would write, an unchanged object always matches — no
false positives. With no objects configured it is a no-op (exit 0), so it is safe
in the framework template and fresh installs.
"""
import argparse
import json
import os
import sys

import yaml

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "evaluation"))
from utils import get_connection, execute_sql, get_semantic_views, get_agents  # noqa: E402


def _cval(row: dict, *keys: str):
    """Case-insensitive column lookup against a DESCRIBE/SELECT result row."""
    for key in keys:
        for actual in row:
            if actual.lower() == key.lower():
                return row[actual]
    return None


def _err(rows: list) -> str:
    """Return an error string if execute_sql returned its error sentinel, else None."""
    if rows and isinstance(rows[0], dict) and "error" in rows[0] and len(rows[0]) == 1:
        return rows[0]["error"]
    return None


def _short_name(obj: dict) -> str:
    """Repo file stem for an object: explicit short_name, else the FQN's name part."""
    sn = obj.get("short_name")
    if sn:
        return sn.lower()
    return (obj.get("fqn", "").split(".")[-1] or "object").lower()


def _write_if_changed(path: str, content: str, dry_run: bool) -> str:
    """Write content to path. Returns 'WROTE', 'UNCHANGED', or 'WOULD CHANGE'."""
    existing = None
    if os.path.exists(path):
        with open(path) as f:
            existing = f.read()
    if existing == content:
        return "UNCHANGED"
    if dry_run:
        return "WOULD CHANGE"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(content)
    return "WROTE"


def _compare(path: str, content: str) -> str:
    """Compare freshly-exported content to the committed file (no writes).
    Returns 'UNCHANGED', 'DRIFTED', or 'MISSING' (no committed file yet)."""
    if not os.path.exists(path):
        return "MISSING"
    with open(path) as f:
        existing = f.read()
    return "UNCHANGED" if existing == content else "DRIFTED"


def _safe_list(fn, environment: str) -> list:
    """Call get_semantic_views/get_agents, returning [] if config is absent/invalid.
    Lets --check no-op gracefully (exit 0) in the template / fresh installs."""
    try:
        return fn(environment) or []
    except Exception:
        return []


def capture_semantic_views(conn, environment: str, dry_run: bool, check: bool = False):
    """Capture (or, when check=True, compare) each governed SV via
    SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW. Returns (errors, drift)."""
    svs = get_semantic_views(environment)
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")
    errors = 0
    drift = 0
    print("Semantic views:")
    if not svs:
        print("  (none configured)")
    for sv in svs:
        fqn = sv["fqn"]
        rows = execute_sql(conn, f"SELECT SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW('{fqn}') AS yaml")
        err = _err(rows)
        if err or not rows:
            print(f"  ERROR capturing {fqn}: {err or 'no rows returned'}", file=sys.stderr)
            errors += 1
            continue
        content = _cval(rows[0], "yaml") or ""
        if not content.endswith("\n"):
            content += "\n"
        path = os.path.join(sv_dir, f"{_short_name(sv)}.yaml")
        if check:
            status = _compare(path, content)
            if status != "UNCHANGED":
                drift += 1
        else:
            status = _write_if_changed(path, content, dry_run)
        print(f"  {status}: {os.path.relpath(path, PROJECT_ROOT)}  (from {fqn})")
    return errors, drift


def capture_agents(conn, environment: str, dry_run: bool, check: bool = False):
    """Capture (or, when check=True, compare) each governed agent via
    DESCRIBE AGENT -> JSON -> YAML (pure spec). Returns (errors, drift)."""
    agents = get_agents(environment)
    agent_dir = os.path.join(PROJECT_ROOT, "agents")
    errors = 0
    drift = 0
    print("Agents:")
    if not agents:
        print("  (none configured)")
    for agent in agents:
        fqn = agent["fqn"]
        rows = execute_sql(conn, f"DESCRIBE AGENT {fqn}")
        err = _err(rows)
        if err or not rows:
            print(f"  ERROR capturing {fqn}: {err or 'no rows returned'}", file=sys.stderr)
            errors += 1
            continue
        spec_raw = _cval(rows[0], "agent_spec")
        if not spec_raw:
            print(f"  ERROR capturing {fqn}: no agent_spec returned by DESCRIBE AGENT", file=sys.stderr)
            errors += 1
            continue
        try:
            spec = json.loads(spec_raw) if isinstance(spec_raw, str) else spec_raw
        except (json.JSONDecodeError, TypeError) as e:
            print(f"  ERROR capturing {fqn}: could not parse agent_spec JSON ({e})", file=sys.stderr)
            errors += 1
            continue
        # Pure spec YAML — no CREATE wrapper. sort_keys=False keeps stable, diff-friendly order.
        content = yaml.safe_dump(spec, sort_keys=False, default_flow_style=False, width=100)
        path = os.path.join(agent_dir, f"{_short_name(agent)}.yaml")
        if check:
            status = _compare(path, content)
            if status != "UNCHANGED":
                drift += 1
        else:
            status = _write_if_changed(path, content, dry_run)
        print(f"  {status}: {os.path.relpath(path, PROJECT_ROOT)}  (from {fqn})")
    return errors, drift


def main():
    parser = argparse.ArgumentParser(
        description="Capture live SV/agent definitions from Snowflake into the repo (.yaml)."
    )
    parser.add_argument("--environment", "-e", default="dev", choices=["dev", "prod"],
                        help="Which environment in config/environments.yaml to capture from.")
    parser.add_argument("--target", "-t", default="all", choices=["semantic_view", "agent", "all"],
                        help="Which object type(s) to capture.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing files.")
    parser.add_argument("--check", action="store_true",
                        help="CI drift guard: compare live objects to committed .yaml without "
                             "writing; exit 1 if any object has drifted. No-op (exit 0) when no "
                             "objects are configured.")
    args = parser.parse_args()

    # Drift guard no-op: if nothing is configured (or config is absent/invalid),
    # there is nothing to check — exit cleanly WITHOUT opening a connection. This
    # keeps the guard safe in the framework template and fresh installs.
    if args.check:
        want_sv = args.target in ("semantic_view", "all")
        want_agent = args.target in ("agent", "all")
        n_sv = len(_safe_list(get_semantic_views, args.environment)) if want_sv else 0
        n_agent = len(_safe_list(get_agents, args.environment)) if want_agent else 0
        if n_sv + n_agent == 0:
            print("No objects configured; skipping drift check.")
            sys.exit(0)

    conn = get_connection(args.environment)

    if args.check:
        banner = f"Drift check (live vs committed) — {args.environment.upper()}"
    else:
        banner = f"{'DRY RUN — ' if args.dry_run else ''}Capturing from {args.environment.upper()}"
    print(f"\n{'='*60}")
    print(f"  {banner}")
    print(f"{'='*60}\n")

    errors = 0
    drift = 0
    try:
        if args.target in ("semantic_view", "all"):
            e, d = capture_semantic_views(conn, args.environment, args.dry_run, args.check)
            errors += e
            drift += d
        if args.target in ("agent", "all"):
            e, d = capture_agents(conn, args.environment, args.dry_run, args.check)
            errors += e
            drift += d
    finally:
        conn.close()

    if args.check:
        if drift or errors:
            print(f"\nDrift check FAILED for {args.environment.upper()}: "
                  f"{drift} object(s) drifted, {errors} error(s).", file=sys.stderr)
            print("Run 'python evaluation/sync_from_snowflake.py "
                  f"--environment {args.environment}' and commit the result.", file=sys.stderr)
            sys.exit(1)
        print(f"\nDrift check passed for {args.environment.upper()}: all objects in sync.")
        return

    verb = "Dry run" if args.dry_run else "Capture"
    print(f"\n{verb} for {args.environment.upper()} complete.")
    if errors:
        print(f"\n{errors} object(s) failed to capture.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
