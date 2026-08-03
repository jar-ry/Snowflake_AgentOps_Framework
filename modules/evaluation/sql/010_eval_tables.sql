-- ============================================================================
-- Module: evaluation / 010_eval_tables.sql
-- Tables that store semantic-view / agent evaluation results. Written by the
-- CI/CD eval scripts (evaluation/*.py). This is the "devops" data layer.
-- ============================================================================

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SEMANTIC_VIEW_EVAL_RUNS (
    eval_run_id         STRING DEFAULT UUID_STRING(),
    environment         STRING,
    semantic_view_name  STRING,
    git_commit_sha      STRING,
    git_branch          STRING,
    total_questions     INTEGER,
    passed_questions    INTEGER,
    failed_questions    INTEGER,
    accuracy_pct        FLOAT,
    threshold_pct       FLOAT,
    passed_threshold    BOOLEAN,
    run_timestamp       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    run_details         VARIANT
);

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SEMANTIC_VIEW_EVAL_DETAILS (
    eval_run_id         STRING,
    question_id         STRING,
    question_text       STRING,
    difficulty          STRING,
    expected_sql        STRING,
    generated_sql       STRING,
    expected_result     VARIANT,
    generated_result    VARIANT,
    match_status        STRING,
    llm_judge_score     FLOAT,
    llm_judge_reasoning STRING,
    latency_ms          INTEGER,
    eval_timestamp      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SCHEDULED_EVAL_RUNS (
    run_id              STRING DEFAULT UUID_STRING(),
    run_type            STRING,
    environment         STRING,
    target_name         STRING,
    accuracy_pct        FLOAT,
    threshold_pct       FLOAT,
    passed_threshold    BOOLEAN,
    total_questions     INTEGER,
    passed_questions    INTEGER,
    failed_questions    INTEGER,
    accuracy_delta      FLOAT,
    run_details         VARIANT,
    run_timestamp       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
