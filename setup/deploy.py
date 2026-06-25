"""
deploy.py — Deploy semantic views and agents to a target environment.

Single source of config: reads config/environments.yaml (via evaluation/utils).
There is NO config/deployment.yaml. The deploy target database / warehouse /
role is read per-environment from environments.yaml; object SCHEMAS come from
each object's own FQN (DATABASE.SCHEMA.NAME). 'dev' is the source of truth — the
same objects are promoted to other environments by retargeting the database.

Usage:
    python setup/deploy.py --target semantic_view --environment prod
    python setup/deploy.py --target agent --environment prod
    python setup/deploy.py --target all --environment prod
    python setup/deploy.py --target all --environment prod --dry-run
"""
import argparse
import os
import subprocess
import sys

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "evaluation"))
from utils import load_config, get_semantic_views, get_agents  # noqa: E402


def get_deploy_target(cfg: dict, environment: str) -> dict:
    """Resolve the per-environment deploy target from environments.yaml.

    Returns {"database", "warehouse", "role"}. Schema is NOT here — it comes
    from each object's FQN. Warehouse falls back to the framework warehouse.
    """
    envs = cfg.get("environments", {})
    if environment not in envs:
        sys.exit(f"ERROR: environment '{environment}' not found in config/environments.yaml")
    env = envs[environment] or {}
    database = env.get("database")
    if not database:
        sys.exit(
            f"ERROR: no deploy target 'database' for environment '{environment}'. "
            f"Add `database:` under environments.{environment} in config/environments.yaml."
        )
    warehouse = env.get("warehouse") or cfg.get("framework", {}).get("warehouse", "")
    return {"database": database, "warehouse": warehouse, "role": env.get("role")}


def _parse_fqn(fqn: str):
    """Split DATABASE.SCHEMA.NAME into (database, schema, name)."""
    parts = (fqn or "").split(".")
    if len(parts) != 3:
        sys.exit(f"ERROR: expected a DATABASE.SCHEMA.NAME FQN, got '{fqn}'")
    return parts[0], parts[1], parts[2]


def run_sql(sql: str, role: str = None, use_temp_connection: bool = True) -> str:
    """Execute SQL via snow CLI. Uses -x for temp connections (OIDC in CI)."""
    if role:
        sql = f"USE ROLE {role};\n{sql}"
    cmd = ["snow", "sql", "-q", sql]
    if use_temp_connection:
        cmd.append("-x")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"SQL ERROR:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def generate_sv_ddl(yaml_path: str) -> str:
    """Convert a semantic view YAML to DDL using generate_ddl.py."""
    script = os.path.join(PROJECT_ROOT, "semantic_views", "generate_ddl.py")
    result = subprocess.run(
        [sys.executable, script, yaml_path],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"DDL generation failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)
    return result.stdout


def rewrite_fqn(ddl: str, original_db: str, schema: str, target_db: str) -> str:
    """Retarget the DDL from the source database to the target (DB-only).

    NOTE: this is still a naive string replace; an anchored, safe rewrite plus
    file-based execution is deferred to a separate hardening change.
    """
    return ddl.replace(f"{original_db}.{schema}.", f"{target_db}.{schema}.")


def deploy_semantic_views(cfg: dict, environment: str, target: dict,
                          use_temp: bool, dry_run: bool) -> list:
    """Deploy semantic views (defined under dev) to the target environment.

    Objects come from config (environments.dev). Schema is derived from each
    FQN; the target database comes from the environment's deploy target.
    """
    svs = get_semantic_views("dev")  # dev is the single source of truth
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")
    deployed = []
    for sv in svs:
        src_db, schema, name = _parse_fqn(sv["fqn"])
        target_fqn = f"{target['database']}.{schema}.{name}"
        if dry_run:
            print(f"  would deploy: {target_fqn}  (from dev {sv['fqn']})")
            deployed.append(target_fqn)
            continue
        # NOTE: still reads .yaml via generate_ddl — lossless .sql deploy is a
        # separate follow-up issue.
        path = os.path.join(sv_dir, f"{sv['short_name'].lower()}.yaml")
        if not os.path.exists(path):
            print(f"  SKIP (file not found): {path}", file=sys.stderr)
            continue
        ddl = generate_sv_ddl(path)
        if environment != "dev":
            ddl = rewrite_fqn(ddl, src_db, schema, target["database"])
        run_sql(ddl, role=target.get("role"), use_temp_connection=use_temp)
        deployed.append(target_fqn)
        print(f"  Deployed: {target_fqn}")
    return deployed


def deploy_agents(cfg: dict, environment: str, target: dict,
                  use_temp: bool, dry_run: bool) -> list:
    """Deploy agents (defined under dev) to the target environment."""
    agents = get_agents("dev")  # dev is the single source of truth
    agent_dir = os.path.join(PROJECT_ROOT, "agents")
    deployed = []
    for agent in agents:
        src_db, schema, name = _parse_fqn(agent["fqn"])
        target_fqn = f"{target['database']}.{schema}.{name}"
        if dry_run:
            print(f"  would deploy: {target_fqn}  (from dev {agent['fqn']})")
            deployed.append(target_fqn)
            continue
        path = os.path.join(agent_dir, f"{agent['short_name'].lower()}.sql")
        if not os.path.exists(path):
            print(f"  SKIP (file not found): {path}", file=sys.stderr)
            continue
        with open(path) as f:
            ddl = f.read()
        lines = [ln for ln in ddl.split("\n") if not ln.strip().startswith("--")]
        ddl = "\n".join(lines).strip().rstrip(";")
        if environment != "dev":
            ddl = rewrite_fqn(ddl, src_db, schema, target["database"])
        run_sql(ddl, role=target.get("role"), use_temp_connection=use_temp)
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

    cfg = load_config()
    target = get_deploy_target(cfg, args.environment)
    use_temp = not args.named_connection

    print(f"\n{'='*60}")
    print(f"  {'DRY RUN — ' if args.dry_run else ''}Deploying to {args.environment.upper()}")
    print(f"  Target database: {target['database']}")
    print(f"  Warehouse:       {target['warehouse']}")
    if target.get("role"):
        print(f"  Role:            {target['role']}")
    print(f"{'='*60}\n")

    if args.target in ("semantic_view", "all"):
        print("Semantic views:")
        deploy_semantic_views(cfg, args.environment, target, use_temp, args.dry_run)

    if args.target in ("agent", "all"):
        print("Agents:")
        deploy_agents(cfg, args.environment, target, use_temp, args.dry_run)

    verb = "Dry run" if args.dry_run else "Deployment"
    print(f"\n{verb} for {args.environment.upper()} complete.")


if __name__ == "__main__":
    main()
