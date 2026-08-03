-- ============================================================================
-- Module: evaluation / 020_eval_views.sql
-- Trend view over the evaluation result tables. Powers the dashboard Accuracy
-- page and the accuracy-regression alert.
-- ============================================================================

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_EVAL_ACCURACY_TREND AS
SELECT
    run_timestamp::DATE                         AS eval_date,
    'semantic_view'                             AS eval_type,
    environment,
    semantic_view_name                          AS target_name,
    accuracy_pct,
    threshold_pct,
    passed_threshold,
    total_questions,
    passed_questions,
    git_commit_sha,
    git_branch,
    LAG(accuracy_pct) OVER (
        PARTITION BY environment, semantic_view_name
        ORDER BY run_timestamp
    )                                           AS prev_accuracy_pct,
    accuracy_pct - COALESCE(LAG(accuracy_pct) OVER (
        PARTITION BY environment, semantic_view_name
        ORDER BY run_timestamp
    ), accuracy_pct)                            AS accuracy_delta,
    run_timestamp
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SEMANTIC_VIEW_EVAL_RUNS

UNION ALL

SELECT
    run_timestamp::DATE                         AS eval_date,
    run_type                                    AS eval_type,
    environment,
    target_name,
    accuracy_pct,
    threshold_pct,
    passed_threshold,
    total_questions,
    passed_questions,
    NULL                                        AS git_commit_sha,
    NULL                                        AS git_branch,
    LAG(accuracy_pct) OVER (
        PARTITION BY environment, target_name, run_type
        ORDER BY run_timestamp
    )                                           AS prev_accuracy_pct,
    accuracy_pct - COALESCE(LAG(accuracy_pct) OVER (
        PARTITION BY environment, target_name, run_type
        ORDER BY run_timestamp
    ), accuracy_pct)                            AS accuracy_delta,
    run_timestamp
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SCHEDULED_EVAL_RUNS;
