# Run evaluations locally

> Status: Stable | Last reviewed: 2026-06-21 | Audience: Engineers

**Purpose.** Run the framework's audits, evaluations, and health checks from the command line against a configured environment — the same scripts CI invokes.

## Prerequisites

- Dependencies installed: `pip install -r requirements.txt`
- A named Snowflake connection in `~/.snowflake/connections.toml`, referenced by `connection_name` in `config/environments.yaml`
- At least one semantic view and/or agent configured under the target environment in `config/environments.yaml`

## Commands

```bash
# Discover agents and semantic views in your account
python evaluation/discover_account.py --format json

# Semantic view best-practices audit (free — no LLM calls)
python evaluation/audit_semantic_view.py --environment dev --live --semantic-view DB.SCHEMA.MY_SV

# Semantic view question-bank evaluation
python evaluation/evaluate_semantic_view.py --environment dev

# Agent native GPA evaluation
python evaluation/audit_agent.py --environment dev

# Generate a starter question bank from your semantic view
python evaluation/generate_question_bank.py --semantic-view-yaml path/to/sv.yaml

# Health checks
python evaluation/health_check.py --environment dev
```

## Notes

- `--environment` selects the block under `environments:` in `config/environments.yaml` (for example `dev` or `prod`).
- The audit (`audit_semantic_view.py`) makes no LLM calls and is free; the evaluation scripts consume Snowflake AI Credits. See [the cost model](../reference/cost-model.md) before running large question banks.
- These are the same scripts wired into CI — see [ci/README.md](../../ci/README.md) for the pipeline stages.
