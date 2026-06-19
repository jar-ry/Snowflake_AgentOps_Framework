# Snowflake AgentOps Framework - Agent Instructions

## Project Overview

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

## Snowflake Environment

The framework creates its tables/views/alerts/tasks in a **single user-provided schema** (configured in `config/environments.yaml`):

```yaml
framework:
  database: CUSTOMER_OPS     # existing database
  schema: AGENTOPS           # created by the framework
  warehouse: COMPUTE_WH     # existing warehouse
```

Everything the framework creates lives in `{{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}`. It does NOT create databases, warehouses, or RBAC roles.

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

## Directory Structure

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
├── LICENSE
├── NOTICE
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

## Key Technical Patterns

### Config Resolution

Config lives in `config/environments.yaml` (populated during bootstrap). The `evaluation/utils.py` module loads it and merges with `config/defaults.yaml`. All paths resolve relative to repo root.

- `config/defaults.yaml` — Universal: LLM models + per-model credit pricing
- `config/environments.yaml` — Your framework DB, agents, semantic views
- `config/thresholds.yaml` — Graduated accuracy thresholds
- `config/monitoring.yaml` — Alert thresholds

### Config Format (environments.yaml)

```yaml
connection_name: MY_CONNECTION

framework:
  database: MY_DB
  schema: AGENTOPS
  warehouse: MY_WH

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

### Evaluation Pipeline (Two Layers)

**Layer 1 — Audits (free, no LLM calls):**
- `audit_semantic_view.py`: Parses YAML or live SV, checks documentation, naming, metadata, relationships.

**Layer 2 — Question Bank Evaluation (LLM-judged):**
- `evaluate_semantic_view.py`: Calls Cortex Analyst, compares SQL results, uses LLM judge.
- `audit_agent.py`: Uses Snowflake's native `EXECUTE_AI_EVALUATION` with GPA metrics.

### Connection Pattern

Python scripts connect via named connection (from `config/environments.yaml`) or env vars:
```python
# CI (headless): SNOWFLAKE_ACCOUNT + SNOWFLAKE_USER + SNOWFLAKE_PRIVATE_KEY
# Local: connection_name from config resolves via ~/.snowflake/connections.toml
```

### CI/CD

See `ci/README.md`. Pipeline stages:
1. Audit (structural, free)
2. Evaluate (LLM-judged accuracy)
3. Deploy (promote to prod)

GitHub Actions examples in `ci/github/`. Portable to any CI system.
