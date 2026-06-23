"""
deploy.py — Deploy semantic views and agents to a target environment.

Reads config/deployment.yaml to determine the target database/schema,
then executes the DDL via `snow sql` (compatible with OIDC auth).

Usage:
    python setup/deploy.py --target semantic_view --environment prod
    python setup/deploy.py --target agent --environment prod
    python setup/deploy.py --target all --environment prod
"""
import argparse
import os
import subprocess
import sys
import yaml

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_deployment_config() -> dict:
    path = os.path.join(PROJECT_ROOT, "config", "deployment.yaml")
    if not os.path.exists(path):
        sys.exit(f"ERROR: {path} not found. Run the bootstrap skill first.")
    with open(path) as f:
        return yaml.safe_load(f)


def load_environments_config() -> dict:
    path = os.path.join(PROJECT_ROOT, "config", "environments.yaml")
    if not os.path.exists(path):
        sys.exit(f"ERROR: {path} not found. Run the bootstrap skill first.")
    with open(path) as f:
        return yaml.safe_load(f)


def run_sql(sql: str, use_temp_connection: bool = True) -> str:
    """Execute SQL via snow CLI. Uses -x for temp connections (OIDC in CI)."""
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


def rewrite_fqn(ddl: str, original_db: str, original_schema: str,
                target_db: str, target_schema: str) -> str:
    """Rewrite the FQN in DDL to point to the target environment."""
    return ddl.replace(
        f"{original_db}.{original_schema}.",
        f"{target_db}.{target_schema}."
    )


def deploy_semantic_views(deploy_cfg: dict, env_cfg: dict, environment: str,
                          use_temp: bool) -> list:
    """Deploy all semantic views to the target environment."""
    target = deploy_cfg["environments"][environment]
    target_db = target["database"]
    target_schema = target["semantic_view_schema"]

    # Get source environment info (dev is the source of truth)
    source = deploy_cfg["environments"]["dev"]
    source_db = source["database"]
    source_schema = source["semantic_view_schema"]

    deployed = []
    sv_dir = os.path.join(PROJECT_ROOT, "semantic_views")
    for fname in os.listdir(sv_dir):
        if not fname.endswith(".yaml") or fname.endswith(".template"):
            continue
        yaml_path = os.path.join(sv_dir, fname)
        ddl = generate_sv_ddl(yaml_path)
        # Rewrite FQN from dev to target
        if environment != "dev":
            ddl = rewrite_fqn(ddl, source_db, source_schema, target_db, target_schema)
        run_sql(ddl, use_temp_connection=use_temp)
        deployed.append(f"{target_db}.{target_schema}.{fname.replace('.yaml', '').upper()}")
        print(f"  Deployed: {deployed[-1]}")

    return deployed


def deploy_agents(deploy_cfg: dict, env_cfg: dict, environment: str,
                  use_temp: bool) -> list:
    """Deploy all agents to the target environment."""
    target = deploy_cfg["environments"][environment]
    target_db = target["database"]
    target_schema = target["agent_schema"]

    source = deploy_cfg["environments"]["dev"]
    source_db = source["database"]
    source_schema = source["agent_schema"]

    deployed = []
    agent_dir = os.path.join(PROJECT_ROOT, "agents")
    for fname in os.listdir(agent_dir):
        if not fname.endswith(".sql") or fname.endswith(".template"):
            continue
        sql_path = os.path.join(agent_dir, fname)
        with open(sql_path) as f:
            ddl = f.read()
        # Strip comment lines
        lines = [ln for ln in ddl.split("\n") if not ln.strip().startswith("--")]
        ddl = "\n".join(lines).strip().rstrip(";")
        # Rewrite FQN from dev to target
        if environment != "dev":
            ddl = rewrite_fqn(ddl, source_db, source_schema, target_db, target_schema)
            # Also rewrite the semantic_view reference inside the spec
            ddl = rewrite_fqn(
                ddl, source_db, source["semantic_view_schema"],
                target_db, target["semantic_view_schema"]
            )
        run_sql(ddl, use_temp_connection=use_temp)
        deployed.append(f"{target_db}.{target_schema}.{fname.replace('.sql', '').upper()}")
        print(f"  Deployed: {deployed[-1]}")

    return deployed


def main():
    parser = argparse.ArgumentParser(description="Deploy objects to a Snowflake environment.")
    parser.add_argument("--target", required=True, choices=["semantic_view", "agent", "all"])
    parser.add_argument("--environment", required=True, choices=["dev", "prod"])
    parser.add_argument("--named-connection", action="store_true",
                        help="Use named connection instead of temp (-x) connection")
    args = parser.parse_args()

    deploy_cfg = load_deployment_config()
    env_cfg = load_environments_config()
    use_temp = not args.named_connection

    print(f"\n{'='*60}")
    print(f"  Deploying to {args.environment.upper()}")
    print(f"  Target: {deploy_cfg['environments'][args.environment]}")
    print(f"{'='*60}\n")

    if args.target in ("semantic_view", "all"):
        print("Deploying semantic views...")
        deploy_semantic_views(deploy_cfg, env_cfg, args.environment, use_temp)

    if args.target in ("agent", "all"):
        print("Deploying agents...")
        deploy_agents(deploy_cfg, env_cfg, args.environment, use_temp)

    print(f"\nDeployment to {args.environment.upper()} complete.")


if __name__ == "__main__":
    main()
