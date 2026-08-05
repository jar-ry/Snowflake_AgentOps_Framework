-- ============================================================================
-- Module: monitoring / 010_monitoring_tables.sql
-- Tables that store aggregated runtime monitoring data: usage/cost, feedback,
-- health checks, alert history, and interaction-quality rollups. Populated by
-- the automation module's scheduled tasks (and health_check.py).
-- ============================================================================

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USER_FEEDBACK (
    feedback_id         STRING DEFAULT UUID_STRING(),
    environment         STRING,
    source              STRING,
    agent_or_sv_name    STRING,
    user_query          STRING,
    agent_response      STRING,
    feedback_rating     INTEGER,
    feedback_text       STRING,
    feedback_category   STRING,
    sentiment_score     FLOAT,
    llm_query_resolved     BOOLEAN,       -- LLM: was the user's question answered? (TASK_LLM_FEEDBACK_SCORING)
    llm_scored_at          TIMESTAMP_NTZ, -- when the LLM assessment last scored this row (NULL = unscored)
    user_name           STRING DEFAULT CURRENT_USER(),
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
-- Backfill columns on pre-existing installs (no-op if already present).
ALTER TABLE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USER_FEEDBACK ADD COLUMN IF NOT EXISTS llm_query_resolved     BOOLEAN;
ALTER TABLE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USER_FEEDBACK ADD COLUMN IF NOT EXISTS llm_scored_at          TIMESTAMP_NTZ;

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS (
    metric_id           STRING DEFAULT UUID_STRING(),
    metric_date         DATE,
    environment         STRING,
    service_type        STRING,
    agent_or_sv_name    STRING,
    total_requests      INTEGER,
    successful_requests INTEGER,
    failed_requests     INTEGER,
    total_input_tokens  BIGINT,
    total_output_tokens BIGINT,
    total_tokens        BIGINT,
    total_cache_read_tokens BIGINT,
    estimated_credits   FLOAT,
    avg_latency_ms      FLOAT,
    p50_latency_ms      FLOAT,
    p95_latency_ms      FLOAT,
    p99_latency_ms      FLOAT,
    unique_users        INTEGER,
    collected_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Per-user cost attribution (chargeback / top-spender analysis)
CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_USER (
    metric_date         DATE,
    environment         STRING,
    agent_or_sv_name    STRING,
    user_name           STRING,
    source              STRING,          -- 'cortex_agent' or 'snowflake_intelligence'
    total_requests      INTEGER,
    total_tokens        BIGINT,
    estimated_credits   FLOAT,
    collected_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Per-model cost breakdown (extracted from CREDITS_GRANULAR / TOKENS_GRANULAR)
CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_MODEL (
    metric_date         DATE,
    environment         STRING,
    agent_or_sv_name    STRING,
    model_name          STRING,
    total_requests      INTEGER,
    input_tokens        BIGINT,
    output_tokens       BIGINT,
    cache_read_tokens   BIGINT,
    cache_write_tokens  BIGINT,
    total_tokens        BIGINT,
    estimated_credits   FLOAT,
    collected_at        TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Budget configuration (user-editable)
CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.AI_USAGE_BUDGETS (
    budget_id           STRING DEFAULT UUID_STRING(),
    budget_name         STRING,
    budget_period       STRING DEFAULT 'MONTHLY',   -- MONTHLY / WEEKLY
    agent_or_sv_name    STRING,                       -- NULL = all agents
    environment         STRING,                       -- NULL = all environments
    budget_credits      FLOAT,
    alert_threshold_pct FLOAT DEFAULT 80,
    is_active           BOOLEAN DEFAULT TRUE,
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.HEALTH_CHECK_RESULTS (
    check_id            STRING DEFAULT UUID_STRING(),
    check_name          STRING,
    environment         STRING,
    target_name         STRING,
    status              STRING,
    details             STRING,
    latency_ms          INTEGER,
    checked_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY (
    alert_id            STRING DEFAULT UUID_STRING(),
    alert_type          STRING,
    severity            STRING,
    environment         STRING,
    target_name         STRING,
    message             STRING,
    metric_value        FLOAT,
    threshold_value     FLOAT,
    acknowledged        BOOLEAN DEFAULT FALSE,
    acknowledged_by     STRING,
    acknowledged_at     TIMESTAMP_NTZ,
    created_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY (
    summary_date        DATE,
    environment         STRING,
    agent_or_sv_name    STRING,
    total_feedback      INTEGER,
    positive_count      INTEGER,
    neutral_count       INTEGER,
    negative_count      INTEGER,
    avg_rating          FLOAT,
    avg_sentiment_score FLOAT,
    negative_pct        FLOAT,
    llm_resolved_count  INTEGER,          -- LLM-judged: # feedback rows where the query was resolved
    llm_total_scored    INTEGER,          -- # feedback rows the LLM assessment has scored
    feedback_categories VARIANT,
    computed_at         TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
-- Backfill columns on pre-existing installs (no-op if already present).
ALTER TABLE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY ADD COLUMN IF NOT EXISTS llm_resolved_count INTEGER;
ALTER TABLE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY ADD COLUMN IF NOT EXISTS llm_total_scored   INTEGER;

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY (
    summary_date            DATE,
    environment             STRING,
    agent_name              STRING,
    total_requests          INTEGER,
    total_threads           INTEGER,
    flagged_requests        INTEGER,
    flagged_threads         INTEGER,
    tool_looping_count      INTEGER,
    excessive_steps_count   INTEGER,
    slow_request_count      INTEGER,
    high_token_burn_count   INTEGER,
    planning_error_count    INTEGER,
    single_turn_dropoff_count INTEGER,
    rapid_rephrasing_count  INTEGER,
    abandoned_count         INTEGER,
    critical_count          INTEGER,
    warning_count           INTEGER,
    flagged_request_pct     FLOAT,
    computed_at             TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
