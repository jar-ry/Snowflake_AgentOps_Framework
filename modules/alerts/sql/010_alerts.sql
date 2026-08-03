-- ============================================================================
-- Module: alerts / 010_alerts.sql
-- Snowflake Alerts that fire when monitoring thresholds are breached. Each
-- alert inserts into ALERT_HISTORY (monitoring module) for tracking.
-- Requires {{WAREHOUSE}} to run the scheduled condition/action.
--
-- NOTE: the accuracy-regression alert reads the evaluation module's
-- V_EVAL_ACCURACY_TREND and lives in 020_alert_accuracy_regression.sql, which
-- install.py applies only when the evaluation module is also selected.
-- ============================================================================

-- Alert: Negative feedback spike (>25% negative in a day)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_NEGATIVE_FEEDBACK_SPIKE
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 7 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY
        WHERE summary_date = CURRENT_DATE() - 1
          AND negative_pct > 25
          AND total_feedback >= 5
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'negative_feedback_spike',
            CASE WHEN negative_pct > 50 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            agent_or_sv_name,
            'Negative feedback spike: ' || ROUND(negative_pct, 1) || '% negative (' ||
                negative_count || '/' || total_feedback || '). Avg rating: ' || ROUND(avg_rating, 1),
            negative_pct,
            25
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY
        WHERE summary_date = CURRENT_DATE() - 1
          AND negative_pct > 25
          AND total_feedback >= 5;

-- Alert: Latency degradation (P95 > 30s)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_LATENCY_DEGRADATION
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 7 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
        WHERE metric_date = CURRENT_DATE() - 1
          AND p95_latency_ms > 30000
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'latency_degradation',
            CASE WHEN p95_latency_ms > 60000 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            agent_or_sv_name,
            service_type || ' P95 latency: ' || ROUND(p95_latency_ms / 1000, 1) || 's (avg: ' || ROUND(avg_latency_ms / 1000, 1) || 's)',
            p95_latency_ms,
            30000
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
        WHERE metric_date = CURRENT_DATE() - 1
          AND p95_latency_ms > 30000;

-- Alert: Cost anomaly (daily cost > 2x 7-day average)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_COST_ANOMALY
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 7 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_TOKEN_COST_TREND
        WHERE metric_date = CURRENT_DATE() - 1
          AND rolling_7d_credits > 0
          AND estimated_credits > (rolling_7d_credits / 7.0) * 2
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'cost_anomaly',
            CASE WHEN estimated_credits > (rolling_7d_credits / 7.0) * 5 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            agent_or_sv_name,
            service_type || ' credit anomaly: ' || ROUND(estimated_credits, 4) || ' credits (' ||
                ROUND(estimated_credits / NULLIF(rolling_7d_credits / 7.0, 0), 1) || 'x normal)',
            estimated_credits,
            ROUND(rolling_7d_credits / 7.0 * 2, 4)
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_TOKEN_COST_TREND
        WHERE metric_date = CURRENT_DATE() - 1
          AND rolling_7d_credits > 0
          AND estimated_credits > (rolling_7d_credits / 7.0) * 2;

-- Alert: Agent error spike (error rate > 10%)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_ERROR_SPIKE
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 7 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
        WHERE metric_date = CURRENT_DATE() - 1
          AND total_requests >= 10
          AND ROUND(failed_requests * 100.0 / NULLIF(total_requests, 0), 2) > 10
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'error_spike',
            CASE WHEN ROUND(failed_requests * 100.0 / NULLIF(total_requests, 0), 2) > 25 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            agent_or_sv_name,
            service_type || ' error rate: ' || ROUND(failed_requests * 100.0 / NULLIF(total_requests, 0), 1) ||
                '% (' || failed_requests || ' failures / ' || total_requests || ' total)',
            ROUND(failed_requests * 100.0 / NULLIF(total_requests, 0), 2),
            10
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS
        WHERE metric_date = CURRENT_DATE() - 1
          AND total_requests >= 10
          AND ROUND(failed_requests * 100.0 / NULLIF(total_requests, 0), 2) > 10;

-- Alert: Health check failure
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HEALTH_FAILURE
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 30 6 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_HEALTH_DASHBOARD
        WHERE status = 'UNHEALTHY'
          AND checked_at >= DATEADD('hour', -25, CURRENT_TIMESTAMP())
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'health_failure',
            'CRITICAL',
            environment,
            target_name,
            'Health check FAILED: ' || check_name || ' - ' || details,
            0,
            0
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_HEALTH_DASHBOARD
        WHERE status = 'UNHEALTHY'
          AND checked_at >= DATEADD('hour', -25, CURRENT_TIMESTAMP());

-- Alert: Interaction quality degradation (>20% flagged OR any critical)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_INTERACTION_QUALITY
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 7 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY
        WHERE summary_date = CURRENT_DATE() - 1
          AND (flagged_request_pct > 20 OR critical_count > 0)
          AND total_requests >= 5
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'interaction_quality',
            CASE WHEN critical_count > 0 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            agent_name,
            'Interaction quality issues: ' || flagged_requests || '/' || total_requests || ' requests flagged (' ||
                ROUND(flagged_request_pct, 1) || '%). Looping: ' || tool_looping_count ||
                ', Steps: ' || excessive_steps_count || ', Slow: ' || slow_request_count ||
                ', High burn: ' || high_token_burn_count || ', Errors: ' || planning_error_count,
            flagged_request_pct,
            20
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY
        WHERE summary_date = CURRENT_DATE() - 1
          AND (flagged_request_pct > 20 OR critical_count > 0)
          AND total_requests >= 5;
