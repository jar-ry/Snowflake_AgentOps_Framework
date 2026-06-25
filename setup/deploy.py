"""
deploy.py — Deploy semantic views and agents to a target environment.

Single source of config: reads config/environments.yaml (via evaluation/utils).
Objects are stored as .yaml files in the repo:
  - Semantic views: native YAML (from SYSTEM$READ_YAML_FROM_SEMANTIC_VIEW),
    deployed via SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML.
  - Agents: pure spec YAML (from DESCRIBE AGENT → JSON → YAML),
    wrapped in CREATE OR REPLACE AGENT at deploy time.

'dev' is the source of truth — the same objects are promoted to other environments
by retargeting the database (structured YAML field edit for SVs; FQN rewrite for agents).

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

import yaml

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "evaluation"))
from utils import load_config, get_semantic_views, get_agents  # noqa: E402


def get_deploy_target(cfg: dict, environment: str) -> dict:
    """Resolve the per-environment deploy target from environments.yaml."""
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
    """Execute SQL via snow CLI."""
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


# ---------------------------------------------------------------------------
# Semantic View: native YAML deploy
# ---------------------------------------------------------------------------

def retarget_sv_yaml(yaml_content: str, src_db: str, target_db: str) -> str:
    """Retarget a semantic view YAML from src_db to target_db.

    Performs a structured rewrite: parses the YAML, updates all
    base_table.database fields, and re-serializes. This avoids the naive
    global string-replace that could corrupt comments or descriptions.
    """
    sv = yaml.safe_load(yaml_content)
    for table in sv.get("tables", []):
        bt = table.get("base_table", {})
        if bt.get("database", "").upper() == src_db.upper():
            bt["database"] = target_db
    return yaml.safe_dump(sv, sort_keys=False, default_flow_style=False, width=120)


def deploy_semantic_views(cfg: dict, environment: str, target: dict,
                          use_temp: bool, dry_run: bool) -> list:
    """Deploy semantic views via SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML."""
    svs = get_semantic_views("dev")
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")
    deployed = []

    for sv in svs:
        src_db, schema, name = _parse_fqn(sv["fqn"])
        target_schema_fqn = f"{target['database']}.{schema}"
        target_fqn = f"{target_schema_fqn}.{name}"

        path = os.path.join(sv_dir, f"{sv['short_name'].lower()}.yaml")
        if not os.path.exists(path):
            sys.exit(
                f"ERROR: file not found for configured semantic view {sv['fqn']}.\n"
                f"  Expected: {path}\n"
                f"  Run the bootstrap capture step or create the file manually."
            )

        if dry_run:
            print(f"  would deploy: {target_fqn}  (from {path})")
            deployed.append(target_fqn)
            continue

        with open(path) as f:
            yaml_content = f.read()

        if environment != "dev":
            yaml_content = retarget_sv_yaml(yaml_content, src_db, target["database"])

        escaped = yaml_content.replace("'", "''")
        sql = f"CALL SYSTEM$CREATE_SEMANTIC_VIEW_FROM_YAML('{target_schema_fqn}', '{escaped}')"
        run_sql(sql, role=target.get("role"), use_temp_connection=use_temp)
        deployed.append(target_fqn)
        print(f"  Deployed: {target_fqn}")

    return deployed


# ---------------------------------------------------------------------------
# Agent: YAML spec → CREATE OR REPLACE AGENT wrapper
# ---------------------------------------------------------------------------

def deploy_agents(cfg: dict, environment: str, target: dict,
                  use_temp: bool, dry_run: bool) -> list:
    """Deploy agents by wrapping .yaml spec in CREATE OR REPLACE AGENT."""
    agents = get_agents("dev")
    agent_dir = os.path.join(PROJECT_ROOT, "agents")
    deployed = []

    for agent in agents:
        src_db, schema, name = _parse_fqn(agent["fqn"])
        target_fqn = f"{target['database']}.{schema}.{name}"

        path = os.path.join(agent_dir, f"{agent['short_name'].lower()}.yaml")
        if not os.path.exists(path):
            sys.exit(
                f"ERROR: file not found for configured agent {agent['fqn']}.\n"
                f"  Expected: {path}\n"
                f"  Run the bootstrap capture step or create the file manually."
            )

        if dry_run:
            print(f"  would deploy: {target_fqn}  (from {path})")
            deployed.append(target_fqn)
            continue

        with open(path) as f:
            spec_yaml = f.read()

        # Retarget SV references inside the agent spec for non-dev environments
        if environment != "dev":
            spec_yaml = spec_yaml.replace(f"{src_db}.", f"{target['database']}.")

        comment = agent.get("comment", "").replace("'", "''")
        ddl = (
            f"CREATE OR REPLACE AGENT {target_fqn}\n"
            f"  COMMENT = '{comment}'\n"
            f"  FROM SPECIFICATION\n"
            f"  $$\n{spec_yaml}$$"
        )
        run_sql(ddl, role=target.get("role"), use_temp_connection=use_temp)
        deployed.append(target_fqn)
        print(f"  Deployed: {target_fqn}")

    return deployed


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Deploy objects to a Snowflake environment.")
    parser.add_argument("--target", required=True, choices=["semantic_view", "agent", "all"])
    parser.add_argument("--environment", required=True, choices=["dev", "prod"])
    parser.add_argument("--temp-connection", action="store_true",
                        help="Use -x temp connection (for OIDC). Default: use named connection from connections.toml")
    parser.add_argument("--dry-run", action="store_true",
                        help="Resolve targets and list objects without deploying")
    args = parser.parse_args()

    cfg = load_config()
    target = get_deploy_target(cfg, args.environment)
    use_temp = args.temp_connection

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
