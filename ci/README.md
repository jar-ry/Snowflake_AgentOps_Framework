# CI/CD Pipeline

This framework is **CI/CD-stack agnostic**. The pipeline logic lives in Python scripts under `evaluation/` and `setup/`. The CI/CD YAML files are just orchestration wrappers that call these scripts.

## Pipeline Stages

Every semantic view or agent change should pass through these stages:

### Stage 1: Audit (Structural, free)
```bash
python evaluation/audit_semantic_view.py --environment dev --ddl-file <path-to-yaml>
```
- Runs 6 structural checks (documentation, naming, relationships, metrics, etc.)
- Zero cost — no LLM calls, just YAML parsing
- **Gate**: Must pass to proceed

### Stage 2: Evaluate (LLM-judged accuracy)
```bash
python evaluation/evaluate_semantic_view.py --environment dev --semantic-view DB.SCHEMA.MY_SV
```
- Runs question bank against the semantic view via Cortex Analyst
- LLM-as-a-judge scores each result
- Reports accuracy percentage by difficulty category
- **Gate**: Must exceed threshold defined in `config/thresholds.yaml`

### Stage 3: Agent Evaluation (Native GPA)
```bash
python evaluation/audit_agent.py --environment dev --agent-name DB.SCHEMA.MY_AGENT
```
- Uses Snowflake's native `EXECUTE_AI_EVALUATION` with built-in GPA metrics
- Scores up to 8 metrics by default — built-in (`answer_correctness`, `logical_consistency`) plus custom LLM-judged (`safety`, `groundedness`, `execution_efficiency`, `answer_relevance`, `conciseness`, `pii_leakage`). The active set is configurable per environment via `thresholds.yaml` (`agent.<env>.metrics`); see [docs/explanation/pillar-2-output-evaluation.md](../docs/explanation/pillar-2-output-evaluation.md).
- **Gate**: Must exceed per-metric thresholds

### Stage 4: Deploy (Promote to production)
```bash
python setup/deploy.py --target semantic_view --environment prod
python setup/deploy.py --target agent --environment prod
```
- Only runs after all gates pass on merge to main
- Deploys the semantic view YAML or agent SQL to the production environment

## Wiring Into Your CI System

The scripts above are the interface. Your CI system just needs to:
1. Check out the repo
2. Install dependencies: `pip install -r requirements.txt`
3. Set environment variables for Snowflake auth:
   - `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PRIVATE_KEY` (key-pair auth, recommended)
   - Or `SNOWFLAKE_ACCOUNT`, `SNOWFLAKE_USER`, `SNOWFLAKE_PASSWORD` (password auth)
4. Run the scripts in order, failing the pipeline if any exit non-zero

### GitHub Actions
See `ci/github/` for working examples. Copy to `.github/workflows/` in your repo.

### GitLab CI
```yaml
stages: [audit, evaluate, deploy]

audit-sv:
  stage: audit
  script:
    - pip install -r requirements.txt
    - python evaluation/audit_semantic_view.py --environment dev

evaluate-sv:
  stage: evaluate
  script:
    - python evaluation/evaluate_semantic_view.py --environment dev
  rules:
    - changes: ["question_banks/semantic_view/**", "evaluation/**"]

deploy-prod:
  stage: deploy
  script:
    - python setup/deploy.py --target semantic_view --environment prod
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
```

### Azure DevOps / Other
Follow the same pattern: install deps, set env vars, run scripts sequentially.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SNOWFLAKE_ACCOUNT` | Yes (CI) | Snowflake account identifier |
| `SNOWFLAKE_USER` | Yes (CI) | Service account username |
| `SNOWFLAKE_PRIVATE_KEY` | Recommended | Base64-encoded PKCS8 private key |
| `SNOWFLAKE_PASSWORD` | Alternative | Password (if not using key-pair) |
| `SNOWFLAKE_ROLE` | Optional | Role to use (defaults to user's default role) |
