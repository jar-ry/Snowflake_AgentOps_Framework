# Cost model

> Status: Stable | Last reviewed: 2026-07-13 | Audience: Engineers, solution architects, customers

**Purpose.** Explain how agent cost is tracked and how to estimate evaluation spend in Snowflake AI Credits.

## Canonical unit: Snowflake AI Credits

All cost in this framework is denominated in **Snowflake AI Credits**, not US dollars. Dollar cost depends on your Snowflake contract's credit price, which varies by edition, region, and commitment.

## Cost data source

The framework uses **`SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY`** as the authoritative source of credit consumption. This view provides one row per agent call with the `TOKEN_CREDITS` column — the exact credits billed by Snowflake, broken down by agent, user, and request.

The daily aggregation task (`TASK_DAILY_USAGE_AGGREGATION`) reads from this view and writes to `USAGE_METRICS`:

```sql
SELECT
    START_TIME::DATE AS metric_date,
    AGENT_DATABASE_NAME AS environment,
    AGENT_NAME AS agent_or_sv_name,
    COUNT(*) AS total_requests,
    SUM(TOKEN_CREDITS) AS estimated_credits,  -- actual billed credits
    ...
FROM SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY
WHERE START_TIME::DATE = CURRENT_DATE() - 1
GROUP BY 1, 2, 3
```

No hardcoded per-model token-to-credit conversion rates are used. Snowflake computes credits server-side using the actual model and token counts.

> **Caveat:** `CORTEX_AGENT_USAGE_HISTORY` excludes requests from Snowflake CoWork / Snowflake Intelligence — those are in `SNOWFLAKE_INTELLIGENCE_USAGE_HISTORY` instead.

## Two loops, two cost profiles

The framework has two evaluation loops with very different cost characteristics:

| Loop | What it is | Cost driver | Approximate cost |
| --- | --- | --- | --- |
| Loop 1 (CI eval) | Agent run against a question bank, scored by an LLM judge | LLM tokens (agent + judge) | The subject of this document |
| Loop 2 (runtime monitoring) | Deterministic SQL rules over `ai_observability_events` | Warehouse compute only | No LLM tokens; negligible |

Loop 2 is pure SQL aggregation on an XSMALL warehouse. The rest of this document is about Loop 1.

## How Loop 1 cost works

For each evaluation run, the framework:

1. Invokes the agent once per question in the bank (the agent plans, calls tools, generates SQL, and synthesizes an answer).
2. Invokes an LLM judge once per metric per question to score the answer.

So a single question with `M` metrics costs: one agent invocation plus `M` judge invocations.

### Typical token profile (measured)

These figures are calibrated against real eval runs — measured medians from the framework's `AGENT_TRACES` view. Your token counts depend on your semantic model size, tools, and step count.

| Component | Input tokens | Cache-read input | Output tokens | Source |
| --- | --- | --- | --- | --- |
| Agent invocation (per question) | ~195,000 | ~116,000 (~85%) | ~410 | measured median |
| Judge invocation (per metric per question) | ~1,200 | n/a | ~300 | estimate |

**Cache reads dominate the agent input.** ~85% of input tokens are served from prompt cache at a much cheaper rate, so naive total-token cost estimates overstate actual spend by ~5x.

### Per-question credit estimate

Using `claude-opus-4-7` with eight metrics:

- Agent (cache-aware, measured): **~0.22 credits** per question (mean)
- Judges (8 metrics): ~0.07 credits
- **Per question total: ~0.29 credits**

> Metric count is a direct cost lever: each metric is one `AI_COMPLETE` call per question. The metric set is configurable per environment in `thresholds.yaml` (`agent.<env>.metrics`).

## Lifecycle cost formula

```text
total_eval_runs = feature_branch_commits_touching_watched_paths
                + E   (one eval per promotion gate)

cost_credits = total_eval_runs
             x num_agents_changed
             x bank_size
             x per_question_credits
```

## Worked examples

Assuming `claude-opus-4-7`, eight metrics, ~0.29 credits/question, one agent per PR, E=2 environments:

| Scenario | Bank size | Commits/PR | PRs/week | Credits/week |
| --- | --- | --- | --- | --- |
| Small team | 20 | 3 | 5 | ~145 |
| Medium team | 35 | 4 | 50 | ~3,050 |
| Large team | 50 | 5 | 200 | ~20,400 |

## Levers to reduce cost

- **Pre-flight smoke check.** Run a 3-question subset before the full bank.
- **Tiered question banks.** Small subset on feature branches, full bank on merge to main.
- **Metric pruning.** Drop metrics you don't need — each removed metric saves 1 judge call/question.
- **Cheaper judge model.** Configurable via `defaults.yaml` — a Haiku-class model is much cheaper.

## Measuring actuals

Query the monitoring schema for real cost data (sourced from `CORTEX_AGENT_USAGE_HISTORY`):

```sql
SELECT metric_date, agent_or_sv_name, total_requests, estimated_credits, total_tokens
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
ORDER BY metric_date DESC;
```

The dashboard's Cost tab visualizes this over time.

## Reconciling against account-level spend

[evaluation/cost_reconcile.py](../../evaluation/cost_reconcile.py) compares the framework's `estimated_credits` against ground-truth account AI spend (`SNOWFLAKE.ACCOUNT_USAGE.METERING_DAILY_HISTORY`, `service_type = 'AI_SERVICES'`):

```bash
python evaluation/cost_reconcile.py --environment dev --days 30
```

Since `estimated_credits` now comes directly from `CORTEX_AGENT_USAGE_HISTORY`, the reconciliation should show close alignment. The metering view is broader (includes all AI services), so `estimated <= actual` is the expected healthy state.
