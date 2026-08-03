# AI Cost Monitoring — Data Model & Reuse Reference

This document summarizes the tables, source views, and logic defined in `setup.sql` for the AI Monitoring Dashboard, and explains how to reuse them in another dashboard.

## Architecture

```
SNOWFLAKE.ACCOUNT_USAGE views (slow)
        │
        ▼
REFRESH_AI_USAGE_SUMMARIES()  ← stored procedure (per-source TRY/CATCH)
        │
        ▼
Pre-aggregated summary tables (fast)  ← queried by dashboards
        ▲
        │
REFRESH_AI_USAGE_TASK  ← scheduled task, twice daily incremental refresh
```

The core idea: `ACCOUNT_USAGE` views are slow and have latency, so a stored procedure pre-aggregates them into small daily-grain summary tables that dashboards can query instantly.

---

## Summary Tables (query these from any dashboard)

Location: `SAMPLES_DB.PUBLIC` (configurable via `SET DB_NAME` / `SET SCHEMA_NAME` at top of `setup.sql`).

### 1. `AI_USAGE_DAILY_SUMMARY`
Primary table for cost/usage trends. One row per (date, feature, category, model).

| Column | Type | Notes |
|--------|------|-------|
| `USAGE_DATE` | DATE | Daily grain |
| `FEATURE_NAME` | VARCHAR | e.g. `CORTEX_ANALYST`, `REST_API`, `CORTEX_AGENT` |
| `CATEGORY` | VARCHAR | Grouping, e.g. `Cortex Functions`, `Cortex Search` |
| `MODEL_NAME` | VARCHAR | Model or `N/A` |
| `TOTAL_CREDITS` | FLOAT | **Primary cost metric** |
| `TOTAL_TOKENS` | NUMBER | Total tokens |
| `INPUT_TOKENS` / `OUTPUT_TOKENS` | NUMBER | Parsed from `TOKENS_GRANULAR` (AISQL + REST API only; 0 elsewhere) |
| `TOTAL_CALLS` | NUMBER | Request count (PTU_COUNT for provisioned throughput) |
| `UNIQUE_USERS` | NUMBER | Distinct users |
| `LAST_REFRESHED` | TIMESTAMP_NTZ | When row was written |

### 2. `AI_USAGE_USER_SUMMARY`
Per-user attribution. One row per (date, user, feature, category). Use for chargeback / top-spender analysis.
Key columns: `USER_NAME`, `FEATURE_NAME`, `CATEGORY`, `TOTAL_CREDITS`, `TOTAL_TOKENS`, `TOTAL_CALLS`.

> Note: Deprecated Cortex Functions view has no user attribution — it falls back to `WAREHOUSE_ID` as the "user".

### 3. `AI_USAGE_MODEL_SUMMARY`
Per-model rollup. One row per (date, model). Use for model cost comparison and input/output token ratios.
Key columns: `MODEL_NAME`, `TOTAL_CREDITS`, `TOTAL_TOKENS`, `INPUT_TOKENS`, `OUTPUT_TOKENS`, `TOTAL_CALLS`.

### 4. `AI_USAGE_REFRESH_LOG`
Operational audit log. One row per refresh run. Columns: `REFRESH_MODE` (FULL/INCREMENTAL), `INCREMENTAL_FROM`, `STATUS` (RUNNING/SUCCESS/PARTIAL/FAILED), `ROWS_*`, `SOURCE_ERRORS`, `ERROR_MESSAGE`. Query this to show data freshness / health in a dashboard.

### 5. `AI_USAGE_BUDGETS`
User-editable budget config. `BUDGET_PERIOD` (e.g. MONTHLY), optional `FEATURE_NAME` (NULL = all features), `BUDGET_CREDITS`, `ALERT_THRESHOLD_PCT`, `IS_ACTIVE`. Default: `Default Monthly Budget` = 1000 credits @ 80%.

### 6. `AI_USAGE_USER_THRESHOLDS`
Anomaly-detection config for per-user spikes. `MAX_DAILY_CREDITS`, `MAX_DAILY_CALLS`, `MULTIPLIER_ALERT` (default 3× baseline). Default: 100 credits/day, 3× multiplier.

---

## Source `ACCOUNT_USAGE` Views

The procedure reads from these (each wrapped in TRY/CATCH so one failing view doesn't block the rest):

| Source View | Feature | Cost Column | Time Column |
|-------------|---------|-------------|-------------|
| `CORTEX_AISQL_USAGE_HISTORY` | Cortex Functions (GA) | `TOKEN_CREDITS` | `USAGE_TIME` |
| `CORTEX_FUNCTIONS_USAGE_HISTORY` | Cortex Functions (deprecated) | `TOKEN_CREDITS` | `START_TIME` |
| `CORTEX_ANALYST_USAGE_HISTORY` | Cortex Analyst | `CREDITS` | `START_TIME` |
| `CORTEX_SEARCH_DAILY_USAGE_HISTORY` | Cortex Search | `CREDITS` | `USAGE_DATE` |
| `CORTEX_FINE_TUNING_USAGE_HISTORY` | Fine-tuning | `TOKEN_CREDITS` | `START_TIME` |
| `CORTEX_DOCUMENT_PROCESSING_USAGE_HISTORY` | Document AI | `CREDITS_USED` | `START_TIME` |
| `CORTEX_REST_API_USAGE_HISTORY` | REST API | *(no credits — tokens only)* | `START_TIME` |
| `CORTEX_AGENT_USAGE_HISTORY` | Cortex Agents (excl. CoWork) | `TOKEN_CREDITS` | `START_TIME` |
| `SNOWFLAKE_INTELLIGENCE_USAGE_HISTORY` | Snowflake Intelligence / **CoWork** (excl. direct Agent API) | `TOKEN_CREDITS` | `START_TIME` |
| `CORTEX_CODE_CLI_USAGE_HISTORY` | Cortex Code (CoCo) CLI | `TOKEN_CREDITS` | `USAGE_TIME` |
| `CORTEX_CODE_SNOWSIGHT_USAGE_HISTORY` | Cortex Code (CoCo) in Snowsight | `TOKEN_CREDITS` | `USAGE_TIME` |
| `CORTEX_CODE_DESKTOP_USAGE_HISTORY` ⚠️ **not yet in setup.sql** | Cortex Code (CoCo) Desktop | `TOKEN_CREDITS` | `USAGE_TIME` |
| `CORTEX_PROVISIONED_THROUGHPUT_USAGE_HISTORY` | Provisioned Throughput | `PTU_CREDITS` | `INTERVAL_START_TIME` |
| `USERS` | (join for USER_ID → NAME) | — | — |
| `METERING_DAILY_HISTORY` | Reconciliation (`SERVICE_TYPE='AI_SERVICES'`) | `CREDITS_USED` | `USAGE_DATE` |
| `USAGE_IN_CURRENCY_DAILY` | Roll-up: credits expressed in currency | — | `USAGE_DATE` |

### Product terminology
- **CoCo** = Cortex Code. Usage is split **per interface** into three mutually-exclusive views: **CLI**, **Desktop**, **Snowsight**. Each excludes the other two, so all three must be summed for total CoCo spend.
- **CoWork** = Snowflake Intelligence, captured by `SNOWFLAKE_INTELLIGENCE_USAGE_HISTORY`. Its granular breakdown includes service type (`cortex_agents`, `cortex_analyst`) and model.

### AI Functions (AISQL) view selection
- `CORTEX_AI_FUNCTIONS_USAGE_HISTORY` is the **current** view for AI functions: tokens + credits per call, hourly windows, plus a `METRICS` column distinguishing token-based vs page-based metering (e.g. `AI_PARSE_DOCUMENT`).
- `CORTEX_AISQL_USAGE_HISTORY` (used by `setup.sql`) is still valid.
- **Deprecated — do not use for new work:** `CORTEX_FUNCTIONS_USAGE_HISTORY` and `CORTEX_FUNCTIONS_QUERY_USAGE_HISTORY` (no longer updated → use `CORTEX_AISQL_USAGE_HISTORY` / `CORTEX_AI_FUNCTIONS_USAGE_HISTORY`).

### Agent vs CoWork exclusion (no double-counting)
`SNOWFLAKE_INTELLIGENCE_USAGE_HISTORY` (CoWork) and `CORTEX_AGENT_USAGE_HISTORY` are **mutually exclusive**: CoWork requests land only in the SI view; direct Cortex Agent API calls land only in the Agent view. `setup.sql` loads both, which is correct — summing them does **not** double-count.

---

## Key Logic Worth Knowing

- **Double-count avoidance (AISQL vs deprecated):** If `CORTEX_AISQL_USAGE_HISTORY` succeeds, the deprecated `CORTEX_FUNCTIONS_USAGE_HISTORY` only loads data before `2025-11-17`. Otherwise it loads all data. Controlled by the `v_has_aisql` flag.
- **Cortex Search:** Only `CORTEX_SEARCH_DAILY_USAGE_HISTORY` is used, split by `CONSUMPTION_TYPE` into `SERVING` vs `QUERY`. Do **not** also pull `CORTEX_SEARCH_SERVING` — that double counts.
- **Token granularity:** `INPUT_TOKENS`/`OUTPUT_TOKENS` are parsed from the `TOKENS_GRANULAR` VARIANT for AISQL and REST API only; each insert has a fallback path if that column doesn't exist. All other sources store 0.
- **Incremental vs full:** `REFRESH_AI_USAGE_SUMMARIES(0)` = incremental (from last success minus 3-day overlap). `REFRESH_AI_USAGE_SUMMARIES(N)` = full refresh for N days. First-ever run with no prior log defaults to 90 days.
- **Retention:** Rows older than 400 days are deleted each run.
- **Refresh window handling:** existing rows `>= v_start_date` are deleted then re-inserted, so re-running is idempotent.

### Not trackable (Snowflake platform limits)
- ML Functions (FORECAST, ANOMALY_DETECTION) — billed as warehouse compute, not AI services.
- Streamlit AI attribution by app name.
- Per-call error rates, concurrency, queue time.

---

## Gaps / Recommended Updates to `setup.sql`

Based on current Snowflake view documentation, `setup.sql` has these gaps:

1. **Missing CoCo Desktop usage.** `setup.sql` loads `CORTEX_CODE_CLI_USAGE_HISTORY` and `CORTEX_CODE_SNOWSIGHT_USAGE_HISTORY` but **not** `CORTEX_CODE_DESKTOP_USAGE_HISTORY`. Since the three CoCo views are mutually exclusive, Desktop spend is currently **undercounted**. Add a Desktop insert block (mirror the CLI/Snowsight blocks, feature name `CORTEX_CODE_DESKTOP`, category `Cortex Code`) to both the daily and user summary sections.
2. **Consider `CORTEX_AI_FUNCTIONS_USAGE_HISTORY`.** It is the current AI-functions view and adds a `METRICS` column (token vs page-based metering). `CORTEX_AISQL_USAGE_HISTORY` still works, so this is optional — evaluate before switching to avoid disrupting the existing AISQL-vs-deprecated double-count logic.
3. **Roll-up validation.** Beyond `METERING_DAILY_HISTORY`, `USAGE_IN_CURRENCY_DAILY` gives credit spend in currency and the Snowsight **Cost Management** dashboard provides a visual `AI_SERVICES` breakdown with per-service-type breakouts — useful cross-checks for a new dashboard.

---

## Reusing This in Another Dashboard

You do **not** need to re-run `setup.sql`. Just point your new dashboard at the existing summary tables.

### 1. Grant read access to your dashboard's role
```sql
GRANT USAGE ON DATABASE SAMPLES_DB TO ROLE <your_app_role>;
GRANT USAGE ON SCHEMA SAMPLES_DB.PUBLIC TO ROLE <your_app_role>;
GRANT SELECT ON TABLE SAMPLES_DB.PUBLIC.AI_USAGE_DAILY_SUMMARY TO ROLE <your_app_role>;
GRANT SELECT ON TABLE SAMPLES_DB.PUBLIC.AI_USAGE_USER_SUMMARY  TO ROLE <your_app_role>;
GRANT SELECT ON TABLE SAMPLES_DB.PUBLIC.AI_USAGE_MODEL_SUMMARY TO ROLE <your_app_role>;
GRANT SELECT ON TABLE SAMPLES_DB.PUBLIC.AI_USAGE_BUDGETS       TO ROLE <your_app_role>;
```

### 2. Common query patterns

**Total credits by feature, last 30 days:**
```sql
SELECT FEATURE_NAME, SUM(TOTAL_CREDITS) AS CREDITS
FROM SAMPLES_DB.PUBLIC.AI_USAGE_DAILY_SUMMARY
WHERE USAGE_DATE >= DATEADD(day, -30, CURRENT_DATE())
GROUP BY FEATURE_NAME
ORDER BY CREDITS DESC;
```

**Daily credit trend:**
```sql
SELECT USAGE_DATE, SUM(TOTAL_CREDITS) AS CREDITS
FROM SAMPLES_DB.PUBLIC.AI_USAGE_DAILY_SUMMARY
GROUP BY USAGE_DATE
ORDER BY USAGE_DATE;
```

**Top users by spend:**
```sql
SELECT USER_NAME, SUM(TOTAL_CREDITS) AS CREDITS
FROM SAMPLES_DB.PUBLIC.AI_USAGE_USER_SUMMARY
WHERE USAGE_DATE >= DATEADD(day, -30, CURRENT_DATE())
GROUP BY USER_NAME
ORDER BY CREDITS DESC
LIMIT 20;
```

**Budget burn (month-to-date vs configured budget):**
```sql
SELECT b.BUDGET_NAME, b.BUDGET_CREDITS,
       SUM(d.TOTAL_CREDITS) AS SPENT,
       ROUND(SUM(d.TOTAL_CREDITS) / b.BUDGET_CREDITS * 100, 1) AS PCT_USED
FROM SAMPLES_DB.PUBLIC.AI_USAGE_BUDGETS b
CROSS JOIN SAMPLES_DB.PUBLIC.AI_USAGE_DAILY_SUMMARY d
WHERE b.BUDGET_PERIOD = 'MONTHLY' AND b.IS_ACTIVE = TRUE
  AND d.USAGE_DATE >= DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY b.BUDGET_NAME, b.BUDGET_CREDITS;
```

**Data freshness (show on dashboard):**
```sql
SELECT MAX(LAST_REFRESHED) AS LAST_UPDATED
FROM SAMPLES_DB.PUBLIC.AI_USAGE_DAILY_SUMMARY;
```

### 3. Notes for the new dashboard
- All tables share a `USAGE_DATE` daily grain — safe to join/union across them on date.
- Use `TOTAL_CREDITS` as the cost metric everywhere; REST API and PTU credit semantics differ (REST API = 0 credits, PTU credits are per-PTU).
- The scheduled task already keeps data fresh (twice daily). A second dashboard needs **no** additional refresh infrastructure — it's read-only against the same tables.
- To validate totals, reconcile against `METERING_DAILY_HISTORY` where `SERVICE_TYPE='AI_SERVICES'` (see verification query in `setup.sql`).
