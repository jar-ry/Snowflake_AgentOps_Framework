# Pillar 3: Runtime Monitoring

> Status: Stable | Last reviewed: 2026-06-21 | Audience: Engineers, solution architects, customers

**Purpose.** Explain how the framework monitors agents in production — tracking cost, latency, interaction quality, and user satisfaction — and how alerts surface regressions that CI evaluation alone cannot catch.

## The idea behind runtime monitoring

Pillar 1 validates inputs before the agent runs. Pillar 2 evaluates outputs during CI with a fixed question bank. Pillar 3 catches problems that only appear **in production with real users**.

CI evaluation has a fundamental limitation: it tests a curated, finite set of questions. Production traffic is infinite and unpredictable. Users ask questions the bank never anticipated. Models drift. Data changes. Latency degrades under load. Costs creep up. Pillar 3 detects these issues continuously, without requiring LLM calls.

## Data source: `snowflake.local.ai_observability_events`

Snowflake captures every Cortex Agent and Analyst interaction in a built-in observability view. The framework creates convenience views on top of it (in `modules/core/sql/020_observability_views.sql`):

| View | What it shows |
|------|--------------|
| `AGENT_TRACES` | Raw per-step spans: tokens, latency, tool selection, planning status |
| `AGENT_REQUEST_SUMMARY` | One row per request: total tokens, duration, steps, tools used |
| `ANALYST_QUERIES` | Text-to-SQL queries from the analyst tool within agent traces |
| `LLM_CALLS` | Non-agent LLM spans (direct COMPLETE calls) |

These views are the foundation for all runtime monitoring. They require no custom instrumentation — Snowflake populates them automatically.

## Interaction quality engine

The most distinctive runtime capability: **rules-based detection of problematic interactions without LLM-as-a-judge**.

Eight signals detect issues in real-time:

### Per-request signals (from `V_REQUEST_QUALITY_SIGNALS`)

| Signal | Threshold | What it catches |
|--------|-----------|-----------------|
| Tool call looping | Same tool called 3+ times | Agent retrying because the semantic view returned bad SQL |
| Excessive planning steps | 4+ steps | Agent struggling to find the right approach |
| Slow request | >60 seconds total | User experience degradation |
| High token burn | >100k tokens | Context window waste, cost risk |
| Planning error | Any step with status ERROR | Agent orchestration failures |

### Per-thread (conversation) signals (from `V_THREAD_QUALITY_SIGNALS`)

| Signal | Threshold | What it catches |
|--------|-----------|-----------------|
| Single-turn drop-off | Thread with exactly 1 turn | User got a bad answer and left |
| Rapid rephrasing | 3+ messages in <5 minutes | User struggling to get a useful answer |
| Abandoned conversation | 3+ turns, then 30min gap | User gave up |

### Why rules, not LLM-as-a-judge?

- **Zero cost** — pure SQL over observability events, no LLM calls
- **Deterministic** — same data always produces same flags (auditable)
- **Real-time** — runs as a daily task; could run hourly with minimal cost
- **Explainable** — each flag has a clear, interpretable threshold

The tradeoff: rules cannot understand semantic quality of answers. They detect behavioral symptoms (looping, slowness, user struggle) rather than semantic failures (wrong answer). That's Pillar 2's job. The two are complementary.

## Monitoring tables and aggregation

The framework runs daily aggregation tasks (plus one recurring LLM scoring task) that turn raw observability and feedback data into queryable tables:

| Task | Schedule | What it produces |
|------|----------|-----------------|
| `TASK_DAILY_USAGE_AGGREGATION` | 02:00 UTC | `USAGE_METRICS` — daily request counts, tokens, credits, latency percentiles per agent |
| `TASK_DAILY_FEEDBACK_ANALYSIS` | 02:15 UTC | `FEEDBACK_DAILY_SUMMARY` — feedback rollup from `USER_FEEDBACK` (incl. LLM-judged resolution counts) |
| `TASK_DAILY_INTERACTION_QUALITY` | 02:30 UTC | `INTERACTION_QUALITY_DAILY` — flag counts and percentages per agent per day |
| `TASK_LLM_FEEDBACK_SCORING` | every 30 min (configurable) | writes `LLM_QUERY_RESOLVED` / `LLM_SENTIMENT_POSITIVE` onto `USER_FEEDBACK` |

These tables feed the trend views and the App Runtime dashboard.

### LLM feedback quality assessment (configurable)

Unlike the rules-based quality engine, this is an *opt-in LLM* signal. `TASK_LLM_FEEDBACK_SCORING` judges ONE dimension per feedback row — **was the user's question resolved?** — surfaced on the Quality page as **Resolution Rate**.

It runs in two stages, because models routinely ignore "reply only YES/NO" and answer in prose (substring matching on that prose misclassified them):

1. **Explain** — `SNOWFLAKE.CORTEX.COMPLETE` produces a short free-text explanation, stored in `LLM_ASSESSMENT_LOG.resolution_response` for audit.
2. **Classify** — `AI_CLASSIFY` turns that explanation into a `YES`/`NO` verdict (`resolution_verdict`), from which the boolean is derived.

Every judgment is written to **`LLM_ASSESSMENT_LOG`** with the model, prompt, explanation, verdict and timestamp, so any number on the dashboard can be traced back to the model's own reasoning.

Perceived sentiment is deliberately **not** LLM-inferred: it comes directly from users via `USER_FEEDBACK.feedback_rating` (thumbs up/down), which is a real signal rather than a guess — and it keeps the assessment to one AI call per row.

It is **fully config-driven** by the single-row `LLM_ASSESSMENT_CONFIG` table (in the `monitoring` module):

- **Prompt, model, sampling, on/off** are columns the task reads at run time — change them with a plain `UPDATE` (no DDL).
- **Schedule** mirrors the task's `SCHEDULE`; changing it issues an `ALTER TASK`.

Operators edit all of these from the dashboard **Settings** page (`/api/llm-config`), which validates input (model allow-list, strict cron, bound-parameter writes) and runs with the service (owner's) role. Because it is an LLM call per row, this task is the one monitoring path with non-trivial Cortex cost — hence the sampling controls (`ALL` vs a bounded `SAMPLE`).

## Alerts

Seven Snowflake Alerts fire when monitoring thresholds are breached. Each inserts into `ALERT_HISTORY` for tracking and dashboard display:

| Alert | What triggers it | Severity logic |
|-------|-----------------|----------------|
| Negative Feedback Spike | >25% negative feedback in a day | >50% = CRITICAL |
| Accuracy Regression | >10% accuracy drop between eval runs | >20% drop = CRITICAL |
| Latency Degradation | P95 latency > 30s | >60s = CRITICAL |
| Cost Anomaly | Daily credits > 2x 7-day average | >5x = CRITICAL |
| Error Spike | Error rate > 10% | >25% = CRITICAL |
| Health Failure | Any health check UNHEALTHY | Always CRITICAL |
| Interaction Quality | >20% flagged requests OR any critical flags | CRITICAL if critical flags present |

### Alert → action loop

The dashboard shows each alert with a tooltip explaining:
1. What caused it
2. Numbered steps to resolve it
3. Links to relevant Snowflake docs
4. Cortex Code commands to run

This closes the loop: alert → understand → fix → verify.

## Trend views

Monitoring views provide rolling analytics for the dashboard:

| View | What it shows |
|------|--------------|
| `V_EVAL_ACCURACY_TREND` | Accuracy over time with delta from previous run |
| `V_FEEDBACK_TREND` | 7-day rolling feedback sentiment |
| `V_TOKEN_COST_TREND` | Daily cost with 7-day and 30-day rolling totals |
| `V_AGENT_USAGE_PATTERNS` | Hourly request distribution (peak hours, day-of-week) |
| `V_HEALTH_DASHBOARD` | Latest status per health check |
| `V_ACTIVE_ALERTS` | Unacknowledged alerts sorted by severity |
| `V_WEEKLY_EXECUTIVE_SUMMARY` | Per-week rollup for leadership reporting |
| `V_INTERACTION_QUALITY_DASHBOARD` | 7-day rolling flag percentages |

## User feedback integration

The `USER_FEEDBACK` table captures explicit user ratings and comments. This data:
- Feeds the feedback alert (spike detection)
- Populates the dashboard feedback trend
- **Most importantly**: provides signal for question bank growth

When a user gives negative feedback, the dashboard tooltip recommends adding that query to the question bank. This is the bridge between Pillar 3 (runtime detection) and Pillar 2 (CI evaluation) — production failures become regression tests.

## Cost of runtime monitoring

Runtime monitoring is **nearly free**:
- All data comes from `snowflake.local.ai_observability_events` (no custom instrumentation)
- Daily tasks run pure SQL aggregation on an XSMALL warehouse
- The rules-based quality engine makes no LLM calls
- Alert evaluation is a simple `EXISTS` check per alert

The main aggregation path costs only warehouse compute (~seconds of XSMALL time per day). The one exception is the **optional** `TASK_LLM_FEEDBACK_SCORING`, which makes two AI calls per scored feedback row (one `COMPLETE` for the explanation, one `AI_CLASSIFY` for the verdict) — its cost scales with feedback volume, which is why it ships with sampling controls (`ALL` vs a bounded `SAMPLE`) and an on/off switch in `LLM_ASSESSMENT_CONFIG`.

## Summary

- **Data source**: Snowflake's native `ai_observability_events` — zero setup cost
- **Quality engine**: 8 rules detect problematic interactions without LLM calls
- **Alerts**: 7 Snowflake Alerts with configurable thresholds and severity escalation
- **Trend views**: rolling analytics for accuracy, cost, latency, quality, and feedback
- **Feedback loop**: production issues → alerts → question bank growth → CI regression tests
- **Cost**: negligible (pure SQL aggregation on XSMALL warehouse)
