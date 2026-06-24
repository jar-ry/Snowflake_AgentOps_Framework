"""
deploy.py — Deploy semantic views and agents to a target environment.

Single source of config: reads config/environments.yaml ONLY (there is no
config/deployment.yaml). The deploy target database/warehouse is resolved per
environment via utils.get_deploy_target(); object schemas are taken from each
object's own FQN. 'dev' is the source of truth — the same objects are promoted
to 'prod' by retargeting the database.

Usage:
    python setup/deploy.py --target semantic_view --environment prod
    python setup/deploy.py --target agent --environment prod
    python setup/deploy.py --target all --environment prod
    python setup/deploy.py --target all --environment prod --dry-run

Semantic views and agents are stored as lossless .sql files (SV from GET_DDL,
agent reconstructed from DESCRIBE AGENT) and deployed verbatim. SQL execution is
still the original `snow sql -q` mechanic and is addressed in PR3 (file-based
execution + safe DB retarget).
"""
import argparse
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "evaluation"))
from utils import (  # noqa: E402
    get_agents,
    get_deploy_target,
    get_semantic_views,
)


def _parse_fqn(fqn: str):
    """Split a DATABASE.SCHEMA.NAME FQN into (database, schema, name)."""
    parts = (fqn or "").split(".")
    if len(parts) != 3:
        sys.exit(f"ERROR: expected a DATABASE.SCHEMA.NAME FQN, got '{fqn}'")
    return parts[0], parts[1], parts[2]


def run_sql(sql: str, use_temp_connection: bool = True) -> str:
    """Execute SQL via snow CLI. Uses -x for temp connections (OIDC in CI).

    PR3 will replace this with file-based execution (`snow sql --filename`).
    """
    cmd = ["snow", "sql", "-q", sql]
    if use_temp_connection:
        cmd.append("-x")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SQL ERROR:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def rewrite_fqn(ddl: str, original_db: str, original_schema: str,
                target_db: str, target_schema: str) -> str:
    """Rewrite the FQN in DDL to point to the target environment.

    PR3 will make this an anchored, safe rewrite (DB-only retarget).
    """
    return ddl.replace(
        f"{original_db}.{original_schema}.",
        f"{target_db}.{target_schema}."
    )


def deploy_semantic_views(environment: str, target: dict,
                          use_temp: bool, dry_run: bool) -> list:
    """Deploy all semantic views (defined in dev) to the target environment."""
    target_db = target["database"]
    svs = get_semantic_views("dev")  # dev is the single source of truth
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")

    deployed = []
    for sv in svs:
        src_db, schema, name = _parse_fqn(sv["fqn"])
        target_fqn = f"{target_db}.{schema}.{name}"
        if dry_run:
            print(f"  would deploy: {target_fqn}  (from dev {sv['fqn']})")
            deployed.append(target_fqn)
            continue

        # Lossless .sql from GET_DDL (bootstrap convention: <short_name>.sql).
        fname = f"{sv['short_name'].lower()}.sql"
        path = os.path.join(sv_dir, fname)
        if not os.path.exists(path):
            print(f"  SKIP (file not found): {path}", file=sys.stderr)
            continue
        with open(path) as f:
            ddl = f.read().strip().rstrip(";")
        if environment != "dev":
            ddl = rewrite_fqn(ddl, src_db, schema, target_db, schema)
        run_sql(ddl, use_temp_connection=use_temp)
        deployed.append(target_fqn)
        print(f"  Deployed: {target_fqn}")

    return deployed


def deploy_agents(environment: str, target: dict,
                  use_temp: bool, dry_run: bool) -> list:
    """Deploy all agents (defined in dev) to the target environment."""
    target_db = target["database"]
    agents = get_agents("dev")  # dev is the single source of truth
    # Schema of bound semantic views (for retargeting the spec's SV reference).
    dev_svs = get_semantic_views("dev")
    sv_schema = _parse_fqn(dev_svs[0]["fqn"])[1] if dev_svs else None
    sv_src_db = _parse_fqn(dev_svs[0]["fqn"])[0] if dev_svs else None
    agent_dir = os.path.join(PROJECT_ROOT, "agents")

    deployed = []
    for agent in agents:
        src_db, schema, name = _parse_fqn(agent["fqn"])
        target_fqn = f"{target_db}.{schema}.{name}"
        if dry_run:
            print(f"  would deploy: {target_fqn}  (from dev {agent['fqn']})")
            deployed.append(target_fqn)
            continue

        fname = f"{agent['short_name'].lower()}.sql"
        path = os.path.join(agent_dir, fname)
        if not os.path.exists(path):
            print(f"  SKIP (file not found): {path}", file=sys.stderr)
            continue
        with open(path) as f:
            ddl = f.read()
        # Strip comment lines (PR3 will stop stripping inside $$ spec blocks).
        lines = [ln for ln in ddl.split("\n") if not ln.strip().startswith("--")]
        ddl = "\n".join(lines).strip().rstrip(";")
        if environment != "dev":
            ddl = rewrite_fqn(ddl, src_db, schema, target_db, schema)
            if sv_schema and sv_src_db:
                ddl = rewrite_fqn(ddl, sv_src_db, sv_schema, target_db, sv_schema)
        run_sql(ddl, use_temp_connection=use_temp)
        deployed.append(target_fqn)
        print(f"  Deployed: {target_fqn}")

    return deployed


def main():
    parser = argparse.ArgumentParser(description="Deploy objects to a Snowflake environment.")
    parser.add_argument("--target", required=True, choices=["semantic_view", "agent", "all"])
    parser.add_argument("--environment", required=True, choices=["dev", "prod"])
    parser.add_argument("--named-connection", action="store_true",
                        help="Use named connection instead of temp (-x) connection")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve targets and list objects without deploying")
    args = parser.parse_args()

    target = get_deploy_target(args.environment)
    use_temp = not args.named_connection

    print(f"\n{'='*60}")
    print(f"  {'DRY RUN — ' if args.dry_run else ''}Deploying to {args.environment.upper()}")
    print(f"  Target database: {target['database']}")
    print(f"  Warehouse:       {target['warehouse']}")
    print(f"{'='*60}\n")

    if args.target in ("semantic_view", "all"):
        print("Semantic views:")
        deploy_semantic_views(args.environment, target, use_temp, args.dry_run)

    if args.target in ("agent", "all"):
        print("Agents:")
        deploy_agents(args.environment, target, use_temp, args.dry_run)

    verb = "Dry run" if args.dry_run else "Deployment"
    print(f"\n{verb} for {args.environment.upper()} complete.")


if __name__ == "__main__":
    main()
