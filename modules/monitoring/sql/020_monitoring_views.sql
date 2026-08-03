-- ============================================================================
-- Module: monitoring / 020_monitoring_views.sql
-- Trend + rollup views over the monitoring tables and (for usage patterns)
-- the core observability views. Powers the dashboard Overview/Cost/Feedback/
-- Alerts pages and several alerts.
-- ============================================================================

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_FEEDBACK_TREND AS
SELECT
    summary_date,
    environment,
    agent_or_sv_name,
    total_feedback,
    positive_count,
    neutral_count,
    negative_count,
    avg_rating,
    avg_sentiment_score,
    negative_pct,
    AVG(avg_rating) OVER (
        PARTITION BY environment, agent_or_sv_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_avg_rating,
    AVG(negative_pct) OVER (
        PARTITION BY environment, agent_or_sv_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_negative_pct,
    SUM(total_feedback) OVER (
        PARTITION BY environment, agent_or_sv_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_total_feedback,
    feedback_categories
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_TOKEN_COST_TREND AS
SELECT
    metric_date,
    environment,
    service_type,
    agent_or_sv_name,
    total_requests,
    successful_requests,
    failed_requests,
    total_input_tokens,
    total_output_tokens,
    total_tokens,
    estimated_credits,
    avg_latency_ms,
    p95_latency_ms,
    unique_users,
    SUM(total_tokens) OVER (
        PARTITION BY environment, service_type, agent_or_sv_name
        ORDER BY metric_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_tokens,
    SUM(estimated_credits) OVER (
        PARTITION BY environment, service_type, agent_or_sv_name
        ORDER BY metric_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_credits,
    AVG(avg_latency_ms) OVER (
        PARTITION BY environment, service_type, agent_or_sv_name
        ORDER BY metric_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    )                                           AS rolling_7d_avg_latency_ms,
    SUM(total_requests) OVER (
        PARTITION BY environment, service_type, agent_or_sv_name
        ORDER BY metric_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    )                                           AS rolling_30d_requests,
    SUM(estimated_credits) OVER (
        PARTITION BY environment, service_type, agent_or_sv_name
        ORDER BY metric_date
        ROWS BETWEEN 29 PRECEDING AND CURRENT ROW
    )                                           AS rolling_30d_credits,
    ROUND(
        COALESCE(failed_requests, 0) * 100.0 / NULLIF(total_requests, 0), 2
    )                                           AS error_rate_pct
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS;

-- Unified agent usage source: combines direct Cortex Agent API calls and
-- Snowflake Intelligence / CoWork calls (mutually exclusive, no double-count).
CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_SOURCE AS
SELECT 'cortex_agent' AS source, START_TIME, END_TIME, USER_NAME,
       AGENT_DATABASE_NAME, AGENT_NAME, TOKENS, TOKEN_CREDITS, CREDITS_GRANULAR, TOKENS_GRANULAR
FROM SNOWFLAKE.ACCOUNT_USAGE.CORTEX_AGENT_USAGE_HISTORY
UNION ALL
SELECT 'snowflake_intelligence' AS source, START_TIME, END_TIME, USER_NAME,
       AGENT_DATABASE_NAME, AGENT_NAME, TOKENS, TOKEN_CREDITS, CREDITS_GRANULAR, TOKENS_GRANULAR
FROM SNOWFLAKE.ACCOUNT_USAGE.SNOWFLAKE_INTELLIGENCE_USAGE_HISTORY;

-- Budget burn: month/week-to-date spend vs each active budget.
CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_BUDGET_BURN AS
SELECT
    b.budget_id, b.budget_name, b.budget_period, b.agent_or_sv_name, b.environment,
    b.budget_credits, b.alert_threshold_pct,
    COALESCE(SUM(u.estimated_credits), 0) AS spent_credits,
    ROUND(COALESCE(SUM(u.estimated_credits), 0) * 100.0 / NULLIF(b.budget_credits, 0), 1) AS pct_used,
    ROUND(b.budget_credits - COALESCE(SUM(u.estimated_credits), 0), 2) AS remaining_credits,
    (COALESCE(SUM(u.estimated_credits), 0) * 100.0 / NULLIF(b.budget_credits, 0)) >= b.alert_threshold_pct AS over_threshold,
    CASE b.budget_period WHEN 'WEEKLY' THEN DATE_TRUNC('week', CURRENT_DATE()) ELSE DATE_TRUNC('month', CURRENT_DATE()) END AS period_start
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.AI_USAGE_BUDGETS b
LEFT JOIN {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS u
    ON u.metric_date >= (CASE b.budget_period WHEN 'WEEKLY' THEN DATE_TRUNC('week', CURRENT_DATE()) ELSE DATE_TRUNC('month', CURRENT_DATE()) END)
   AND (b.agent_or_sv_name IS NULL OR u.agent_or_sv_name = b.agent_or_sv_name)
   AND (b.environment IS NULL OR u.environment = b.environment)
WHERE b.is_active = TRUE
GROUP BY b.budget_id, b.budget_name, b.budget_period, b.agent_or_sv_name, b.environment, b.budget_credits, b.alert_threshold_pct;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_PATTERNS AS
SELECT
    event_time::DATE                                                AS usage_date,
    HOUR(event_time)                                                AS usage_hour,
    DAYNAME(event_time)                                             AS day_of_week,
    COALESCE(database_name, 'UNKNOWN')                              AS environment,
    CASE
        WHEN span_name LIKE 'ReasoningAgentStep%' OR span_name LIKE 'CodingAgent%' THEN 'cortex_agent'
        WHEN span_name ILIKE '%Analyst%' OR span_name ILIKE '%SqlExecution%' THEN 'cortex_analyst'
        ELSE 'other'
    END                                                             AS service_type,
    agent_name,
    model_used,
    COUNT(*)                                                        AS span_count,
    COUNT(DISTINCT trace_id)                                        AS request_count,
    SUM(COALESCE(total_tokens, 0))                                  AS total_tokens,
    AVG(planning_duration_ms)                                       AS avg_latency_ms,
    COUNT_IF(status_code != 'STATUS_CODE_OK')                       AS error_count
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.AGENT_TRACES
GROUP BY 1, 2, 3, 4, 5, 6, 7;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_HEALTH_DASHBOARD AS
SELECT *
FROM (
    SELECT
        check_name,
        environment,
        target_name,
        status,
        details,
        latency_ms,
        checked_at,
        ROW_NUMBER() OVER (
            PARTITION BY check_name, environment, target_name
            ORDER BY checked_at DESC
        ) AS rn
    FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.HEALTH_CHECK_RESULTS
)
WHERE rn = 1;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_ACTIVE_ALERTS AS
SELECT
    alert_id,
    alert_type,
    severity,
    environment,
    target_name,
    message,
    metric_value,
    threshold_value,
    created_at,
    DATEDIFF('hour', created_at, CURRENT_TIMESTAMP()) AS hours_since_created
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
WHERE acknowledged = FALSE
ORDER BY
    CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
    created_at DESC;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_WEEKLY_EXECUTIVE_SUMMARY AS
SELECT
    DATE_TRUNC('week', metric_date)                     AS week_start,
    environment,
    SUM(total_requests)                                 AS total_requests,
    SUM(successful_requests)                            AS successful_requests,
    ROUND(SUM(successful_requests) * 100.0 / NULLIF(SUM(total_requests), 0), 2) AS success_rate_pct,
    SUM(total_tokens)                                   AS total_tokens,
    SUM(estimated_credits)                              AS total_credits,
    AVG(avg_latency_ms)                                 AS avg_latency_ms,
    SUM(unique_users)                                   AS total_user_sessions
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
GROUP BY 1, 2;
