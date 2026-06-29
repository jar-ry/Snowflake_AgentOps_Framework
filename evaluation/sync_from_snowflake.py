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


def capture_semantic_views(conn, environment: str, dry_run: bool) -> int:
    """Capture each governed SV via SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW."""
    svs = get_semantic_views(environment)
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")
    errors = 0
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
        status = _write_if_changed(path, content, dry_run)
        print(f"  {status}: {os.path.relpath(path, PROJECT_ROOT)}  (from {fqn})")
    return errors


def capture_agents(conn, environment: str, dry_run: bool) -> int:
    """Capture each governed agent via DESCRIBE AGENT -> JSON -> YAML (pure spec)."""
    agents = get_agents(environment)
    agent_dir = os.path.join(PROJECT_ROOT, "agents")
    errors = 0
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
        status = _write_if_changed(path, content, dry_run)
        print(f"  {status}: {os.path.relpath(path, PROJECT_ROOT)}  (from {fqn})")
    return errors


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
    args = parser.parse_args()

    conn = get_connection(args.environment)

    print(f"\n{'='*60}")
    print(f"  {'DRY RUN — ' if args.dry_run else ''}Capturing from {args.environment.upper()}")
    print(f"{'='*60}\n")

    errors = 0
    try:
        if args.target in ("semantic_view", "all"):
            errors += capture_semantic_views(conn, args.environment, args.dry_run)
        if args.target in ("agent", "all"):
            errors += capture_agents(conn, args.environment, args.dry_run)
    finally:
        conn.close()

    verb = "Dry run" if args.dry_run else "Capture"
    print(f"\n{verb} for {args.environment.upper()} complete.")
    if errors:
        print(f"\n{errors} object(s) failed to capture.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
