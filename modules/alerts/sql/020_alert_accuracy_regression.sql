-- ============================================================================
-- Module: alerts / 020_alert_accuracy_regression.sql
-- CONDITIONAL: applied by install.py only when BOTH alerts and evaluation are
-- selected (it reads the evaluation module's V_EVAL_ACCURACY_TREND view).
-- Declared with `requires: [evaluation]` in modules.yaml.
-- ============================================================================

-- Alert: Accuracy regression (>10% drop between eval runs)
CREATE OR REPLACE ALERT {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_ACCURACY_REGRESSION
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 8 * * * UTC'
    IF (EXISTS (
        SELECT 1
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_EVAL_ACCURACY_TREND
        WHERE eval_date >= CURRENT_DATE() - 1
          AND accuracy_delta < -10
          AND prev_accuracy_pct IS NOT NULL
    ))
    THEN
        INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY
            (alert_type, severity, environment, target_name, message, metric_value, threshold_value)
        SELECT
            'accuracy_regression',
            CASE WHEN accuracy_delta < -20 THEN 'CRITICAL' ELSE 'WARNING' END,
            environment,
            target_name,
            eval_type || ' accuracy regression: ' || ROUND(accuracy_pct, 1) || '% (was ' ||
                ROUND(prev_accuracy_pct, 1) || '%, delta: ' || ROUND(accuracy_delta, 1) || '%)',
            accuracy_delta,
            -10
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_EVAL_ACCURACY_TREND
        WHERE eval_date >= CURRENT_DATE() - 1
          AND accuracy_delta < -10
          AND prev_accuracy_pct IS NOT NULL;
