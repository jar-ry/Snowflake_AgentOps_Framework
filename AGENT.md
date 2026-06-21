# Snowflake AgentOps Framework — agent instructions

## Project overview

This is a governance framework for **Semantic Views** and **Cortex Agents** in Snowflake. Users clone the repo, bootstrap from their existing environment, and get CI/CD quality gates + monitoring — without creating new databases, RBAC roles, or data tables.

The repo contains the **framework only**. Users point it at their existing objects via `config/environments.yaml`.

## Conventions

- Always ask the user when unsure or when design decisions are needed
- Always plan and document the plan before starting any work
- Write all code to files so everything is reproducible
- All SQL follows Snowflake SQL syntax
- Python scripts use `snowflake-connector-python` via named connections
- YAML for configuration (environments, thresholds, question banks)
- CI/CD is vendor-neutral (see `ci/README.md`)

## Snowflake environment

The framework creates its tables, views, alerts, and tasks in a **single user-provided schema** (`{{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}`, configured in `config/environments.yaml`). It does NOT create databases, warehouses, or RBAC roles.

### What the framework creates (in the framework schema)

| Category | Objects |
|----------|---------|
| Eval tables | SEMANTIC_VIEW_EVAL_RUNS, SEMANTIC_VIEW_EVAL_DETAILS |
| Monitoring tables | USER_FEEDBACK, SCHEDULED_EVAL_RUNS, USAGE_METRICS, HEALTH_CHECK_RESULTS, ALERT_HISTORY, FEEDBACK_DAILY_SUMMARY, INTERACTION_QUALITY_DAILY |
| Observability views | AGENT_TRACES, AGENT_REQUEST_SUMMARY, ANALYST_QUERIES, LLM_CALLS |
| Monitoring views | V_EVAL_ACCURACY_TREND, V_FEEDBACK_TREND, V_TOKEN_COST_TREND, V_AGENT_USAGE_PATTERNS, V_HEALTH_DASHBOARD, V_ACTIVE_ALERTS, V_WEEKLY_EXECUTIVE_SUMMARY |
| Quality views | V_REQUEST_QUALITY_SIGNALS, V_THREAD_QUALITY_SIGNALS, V_INTERACTION_QUALITY_FLAGS, V_INTERACTION_QUALITY_DASHBOARD |
| Alerts | 7 alerts (feedback, accuracy, latency, cost, error, health, quality) |
| Tasks | 3 tasks (daily usage, daily feedback, daily quality) |

## Directory structure

```
Snowflake_AgentOps_Framework/
├── .cortex/skills/
│   └── bootstrap-from-existing/        # Interactive bootstrap skill
│       └── SKILL.md                    # Skill definition (/skill add)
├── agents/                             # Agent specs under governance
├── semantic_views/                     # Semantic view definitions under governance
├── app/                                # App Runtime dashboard (Next.js)
├── ci/                                 # CI/CD — vendor-neutral
│   ├── README.md                      # Pipeline stages & wiring guide
│   └── github/                        # GitHub Actions examples
├── config/                             # All configuration
│   ├── defaults.yaml                  # LLM models + credit pricing
│   ├── environments.yaml.template     # Instance config template
│   ├── monitoring.yaml.template       # Alert thresholds
│   └── thresholds.yaml.template       # Eval accuracy thresholds
├── evaluation/                         # All Python (eval + monitoring)
│   ├── audit_semantic_view.py         # Structural audit
│   ├── audit_agent.py                 # Native GPA evaluation
│   ├── evaluate_semantic_view.py      # Batch SV eval
│   ├── llm_judge.py                   # LLM-as-a-Judge
│   ├── discover_account.py            # Account discovery
│   ├── generate_question_bank.py      # Question-bank generator
│   ├── health_check.py               # Health checks
│   ├── cost_reconcile.py             # Cost reconciliation
│   ├── adversarial_library.yaml       # Adversarial patterns
│   └── utils.py                       # Config loader + SF helpers
├── question_banks/                     # User's question banks
├── setup/
│   ├── 00_framework_tables.sql        # All framework SQL objects
│   └── deploy.py                      # Deploy helper (CI)
├── docs/                              # Reference & explanation
└── README.md
```

## Key technical patterns

### Configuration

`evaluation/utils.py` loads `config/environments.yaml` (populated during bootstrap) and merges it with `config/defaults.yaml`. All paths resolve relative to repo root.

- `config/defaults.yaml` — platform-wide: LLM models + per-model credit pricing
- `config/environments.yaml` — your framework DB, agents, semantic views
- `config/thresholds.yaml` — graduated accuracy thresholds (quality gates)
- `config/monitoring.yaml` — alert thresholds

```yaml
connection_name: MY_CONNECTION

framework:
  database: MY_DB        # existing database
  schema: AGENTOPS       # created by the framework (the only schema it creates)
  warehouse: MY_WH       # existing warehouse

environments:
  dev:
    semantic_views:
      - fqn: DB.SCHEMA.MY_SV
        short_name: MY_SV
    agents:
      - fqn: DB.SCHEMA.MY_AGENT
        short_name: MY_AGENT
        semantic_views: [DB.SCHEMA.MY_SV]
  prod:
    semantic_views: []
    agents: []

question_banks:
  agent_dir: question_banks/agent
  semantic_view_dir: question_banks/semantic_view
```

### Observability

- **Primary source**: `snowflake.local.ai_observability_events` (Snowflake's native AI observability)
- No custom event table needed. Framework views wrap the native view.
- Key span names: `ReasoningAgentStepPlanning-N`, `CodingAgent.Step-N`
- Token fields: `snow.ai.observability.agent.planning.token_count.{input,output,total,cache_read_input}`

### Evaluation pipeline

Two CI layers — Layer 1 maps to Pillar 1 (input governance), Layer 2 to Pillar 2 (output evaluation); runtime monitoring is Pillar 3. See [docs/](docs/README.md) for the pillar explanations.

- **Layer 1 — audits (free, no LLM calls):** `audit_semantic_view.py` parses YAML or a live SV and checks documentation, naming, metadata, and relationships.
- **Layer 2 — evaluation (LLM-judged):** `evaluate_semantic_view.py` (Cortex Analyst + SQL result compare + LLM judge); `audit_agent.py` (native `EXECUTE_AI_EVALUATION` with GPA metrics).

### Connection pattern

Python scripts connect via a named connection (from `config/environments.yaml`) or env vars:
```python
# CI (headless): SNOWFLAKE_ACCOUNT + SNOWFLAKE_USER + SNOWFLAKE_PRIVATE_KEY
# Local: connection_name from config resolves via ~/.snowflake/connections.toml
```

### CI/CD

Vendor-neutral; stages are Audit → Evaluate → Deploy. See [ci/README.md](ci/README.md) for full wiring and the GitHub Actions examples in `ci/github/`.
