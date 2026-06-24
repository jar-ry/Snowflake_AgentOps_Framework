# Set Up CI/CD

This guide covers setting up CI/CD for the AgentOps framework using **GitHub Actions** or **Azure DevOps**.

Both use OIDC (workload identity federation) — no long-lived secrets, no private keys.

## Architecture

```
  Feature Branch / PR          main branch
  ─────────────────           ──────────────
        │                          │
   CI: Evaluate                CD: Evaluate → Gate → Deploy
   against DEV                 against DEV, then deploy to PROD
        │                          │
   Post results                Only if quality gates pass
   as PR comment               → PROD database
```

**Key principle**: Only the CD pipeline (triggered by merges to `main`) can deploy to the PROD database. Human developers have read-only access to PROD.

## Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | GitHub Actions CI (PRs + branch pushes) |
| `.github/workflows/cd.yml` | GitHub Actions CD (merge to main → deploy) |
| `ci/azure/ci-pipeline.yml` | Azure DevOps CI |
| `ci/azure/cd-pipeline.yml` | Azure DevOps CD |
| `ci/azure/config.toml` | Snowflake CLI config for Azure (no credentials) |
| `config/environments.yaml` | Single config: governed objects + per-environment deploy target (`database`/`warehouse`) |
| `setup/cicd_setup.sql` | Creates the service user, role, and grants |
| `setup/deploy.py` | Deployment script (vendor-neutral) |

## Option A: GitHub Actions (OIDC)

### 1. Run the Snowflake setup SQL

Fill in the placeholders in `setup/cicd_setup.sql` and execute with ACCOUNTADMIN:

```sql
-- Key values to replace:
-- {{GITHUB_REPO}}      → your-org/your-repo
-- {{PROD_DATABASE}}    → your prod database name
-- {{DEV_DATABASE}}     → your dev database name
-- {{SV_SCHEMA}}        → ANALYTICS (or your schema)
-- {{AGENT_SCHEMA}}     → AI (or your schema)
-- {{FRAMEWORK_DB}}     → same as dev or separate ops db
-- {{FRAMEWORK_SCHEMA}} → AGENTOPS
-- {{WAREHOUSE}}        → your warehouse
```

This creates:
- `CICD_DEPLOY_ROLE` — only role with CREATE on prod
- `github_cicd_user` — TYPE=SERVICE user with OIDC workload identity

### 2. Set the GitHub repository secret

Only ONE secret is needed (OIDC handles auth):

```bash
gh secret set SNOWFLAKE_ACCOUNT --body "YOUR_ACCOUNT_IDENTIFIER"
```

### 3. OIDC subject scoping

The service user's SUBJECT claim controls which workflows can authenticate:

| Scope | SUBJECT value |
|-------|---------------|
| Only main branch (CD) | `repo:org/repo:ref:refs/heads/main` |
| Any branch (CI + CD) | `repo:org/repo:*` |
| Specific environment | `repo:org/repo:environment:production` |

For CI (PRs/branches) to also authenticate, you may need a broader subject or a second service user. The current setup restricts deployment to main-only.

### 4. How it works

**On PR / branch push** → `ci.yml` runs:
1. Authenticates via OIDC as `github_cicd_user`
2. Evaluates semantic views + agents against DEV
3. Posts results as a PR comment

**On merge to main** → `cd.yml` runs:
1. Evaluates against DEV (quality gate)
2. If thresholds pass → deploys to PROD via `setup/deploy.py`
3. Uploads results as artifacts

## Option B: Azure DevOps (OIDC)

### 1. Create Azure Entra ID App Registration

1. Azure Portal → Entra ID → App registrations → New
2. Note the **Application (client) ID** and **Tenant ID**
3. Certificates & secrets → Federated credentials → Add:
   - Issuer: `https://vstoken.dev.azure.com/<tenant-id>`
   - Subject: `sc://<org>/<project>/<service-connection>`
   - Audience: `api://AzureADTokenExchange`

### 2. Create Azure DevOps service connection

1. Project Settings → Service connections → New → Azure Resource Manager
2. Select "Workload Identity federation (manual)"
3. Name: `snowflake-wif-connection` (must match pipeline YAML)

### 3. Run the Snowflake setup SQL

Uncomment the Azure DevOps section in `setup/cicd_setup.sql` and fill in:
- `{{AZURE_TENANT_ID}}`
- `{{ADO_ORG}}`
- `{{ADO_PROJECT}}`
- `{{ADO_SERVICE_CONN}}`

### 4. Set pipeline variables

Add `SNOWFLAKE_ACCOUNT` as a variable in your pipeline or variable group.

### 5. Import the pipelines

Point Azure DevOps at:
- `ci/azure/ci-pipeline.yml` for CI
- `ci/azure/cd-pipeline.yml` for CD

## Deployment Config

There is a single config file — `config/environments.yaml`. Objects are defined
ONCE under `dev` (the source of truth); each environment carries its own deploy
**target** (`database` + `warehouse`). Object schemas come from each object's own
FQN, so there are no separate `*_schema` keys.

```yaml
environments:
  dev:
    database: BABY_MART_DEMO     # deploy target for dev
    warehouse: RETAIL_AI_EVAL_WH
    semantic_views:
      - fqn: BABY_MART_DEMO.ANALYTICS.CATEGORY_VIEW
        short_name: category
    agents:
      - fqn: BABY_MART_DEMO.AI.RETAIL_AGENT
        short_name: retail
        semantic_views:
          - BABY_MART_DEMO.ANALYTICS.CATEGORY_VIEW
  prod:
    database: BABY_MART_PROD     # deploy target for prod (release promotion)
    warehouse: RETAIL_AI_EVAL_WH
    semantic_views: []           # empty = promote the dev objects as-is
    agents: []
```

On release, `setup/deploy.py --environment prod` retargets the dev objects to
`prod.database` (DB-level retarget; schema is preserved). Use `--dry-run` to
print the resolved target and the objects that would be deployed without
touching Snowflake.

## Prod-Only Enforcement

The security model ensures only CI/CD can write to prod:

1. `CICD_DEPLOY_ROLE` is the **only** role with `CREATE SEMANTIC VIEW` and `CREATE AGENT` on the prod database
2. This role is granted **only** to the service users (`github_cicd_user` / `ado_cicd_user`)
3. The OIDC subject is scoped to `refs/heads/main` — only merges trigger deployment
4. Developer roles have `USAGE` + `SELECT` on prod (read-only)

## Troubleshooting

| Issue | Fix |
|-------|-----|
| OIDC token fails | Ensure `permissions: id-token: write` is in your workflow |
| Subject mismatch | Check the exact subject claim format (see GitHub/Azure docs) |
| `snow: command not found` | The Snowflake action must run before any `snow` commands |
| Prod deploy blocked | Only merges to `main` trigger `cd.yml` |
| Eval scripts can't connect | Service user needs grants on dev + framework schemas |
