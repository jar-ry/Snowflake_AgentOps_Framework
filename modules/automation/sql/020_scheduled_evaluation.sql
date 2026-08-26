-- ============================================================================
-- Module: automation / 020_scheduled_evaluation.sql
-- Weekly Cortex Analyst evaluation, run entirely inside Snowflake (no CI).
--
-- Requires the `evaluation` module: this is the writer for SCHEDULED_EVAL_RUNS,
-- which V_EVAL_ACCURACY_TREND already exposes to the Accuracy page and to the
-- accuracy-regression alert. Also requires {{WAREHOUSE}}.
--
-- Two independent safety catches, both off by default:
--   1. CREATE TASK always starts SUSPENDED  -> ALTER TASK ... RESUME to schedule
--   2. EVAL_SCHEDULE_CONFIG.is_enabled = FALSE -> the task returns immediately
-- So nothing runs, and nothing is charged, until you opt in twice.
--
-- Ground truth is the semantic view's own verified queries, NOT the Python
-- question banks under question_banks/. The two numbers are not comparable and
-- are kept as separate series via run_type -- see docs/explanation/pillar-2.
-- ============================================================================

-- EXECUTE_AI_EVALUATION accepts its config only as a file on a stage, and the
-- installer executes SQL (it cannot PUT). So the task writes the YAML itself
-- with COPY INTO ... SINGLE = TRUE OVERWRITE = TRUE. This format is delimiter-
-- less and quote-less so the YAML body lands verbatim.
CREATE FILE FORMAT IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FF_EVAL_CONFIG_YAML
    TYPE = 'CSV'
    FIELD_DELIMITER = NONE
    RECORD_DELIMITER = '\n'
    SKIP_HEADER = 0
    FIELD_OPTIONALLY_ENCLOSED_BY = NONE
    ESCAPE_UNENCLOSED_FIELD = NONE
    COMPRESSION = NONE;

CREATE STAGE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_CONFIG_STAGE
    FILE_FORMAT = {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FF_EVAL_CONFIG_YAML
    DIRECTORY = (ENABLE = TRUE)
    COMMENT = 'Holds the generated Cortex Analyst evaluation config YAML for TASK_WEEKLY_EVALUATION';

-- Single-row config, same pattern as LLM_ASSESSMENT_CONFIG: everything except
-- the SCHEDULE is data, so it can be changed with a plain UPDATE (or later from
-- the dashboard Settings page) without redeploying the task.
CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG (
    config_id           STRING  DEFAULT 'default',
    is_enabled          BOOLEAN DEFAULT FALSE,
    semantic_view       STRING,                        -- fully qualified; required
    environment         STRING,                        -- written to SCHEDULED_EVAL_RUNS
    threshold_pct       FLOAT   DEFAULT 70,            -- thresholds.yaml semantic_view.default
    metric_version      STRING  DEFAULT 'v3',          -- pinned, see note below
    max_wait_minutes    INTEGER DEFAULT 30,            -- poll cap; protects the warehouse
    schedule_cron       STRING  DEFAULT '0 3 * * 1',   -- informational; task DDL owns the real schedule
    updated_by          STRING,
    updated_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- metric_version is pinned deliberately. Scores from different sql_correctness
-- versions are not comparable, and an unpinned metric silently rolls forward to
-- a new judge model, which would move the accuracy trend (and therefore the
-- regression alert) for reasons unrelated to the semantic view.

-- Idempotent seed. semantic_view is left NULL on purpose: the task refuses to
-- run without it, so a fresh install cannot accidentally evaluate the wrong view.
INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG
    (config_id, is_enabled, semantic_view, environment, threshold_pct, metric_version, max_wait_minutes, schedule_cron, updated_by)
SELECT 'default', FALSE, NULL, '{{FRAMEWORK_DB}}', 70, 'v3', 30, '0 3 * * 1', CURRENT_USER()
WHERE NOT EXISTS (
    SELECT 1 FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default'
);

-- Task: weekly Cortex Analyst evaluation against the semantic view's verified
-- queries, writing one summary row to SCHEDULED_EVAL_RUNS.
--
-- EXECUTE_AI_EVALUATION is asynchronous: 'START' returns as soon as the run is
-- submitted, so the body polls 'STATUS' before collecting results. Both calls
-- return a TABLE, hence the RESULT_SCAN(LAST_QUERY_ID()) reads.
--
-- Identifiers from the config row are charset-validated before being
-- interpolated, the same guard TASK_LLM_FEEDBACK_SCORING applies to its model.
CREATE OR REPLACE TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_WEEKLY_EVALUATION
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 3 * * 1 UTC'
    COMMENT = 'Weekly Cortex Analyst evaluation vs verified queries; writes SCHEDULED_EVAL_RUNS (config in EVAL_SCHEDULE_CONFIG)'
AS
BEGIN
    LET v_enabled BOOLEAN := (SELECT is_enabled FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');
    LET v_sv STRING := (SELECT semantic_view FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');
    LET v_env STRING := (SELECT environment FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');
    LET v_threshold FLOAT := (SELECT threshold_pct FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');
    LET v_metric STRING := (SELECT metric_version FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');
    LET v_max_wait INTEGER := (SELECT COALESCE(max_wait_minutes, 30) FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG WHERE config_id = 'default');

    IF (v_enabled = FALSE OR v_sv IS NULL) THEN
        RETURN 'skipped: disabled or no semantic view configured';
    END IF;
    -- Dots are allowed (fully qualified name); anything else is rejected before
    -- it reaches string concatenation.
    IF (NOT RLIKE(v_sv, '^[A-Za-z0-9_]+\\.[A-Za-z0-9_]+\\.[A-Za-z0-9_]+$')) THEN
        RETURN 'skipped: semantic_view must be a plain fully qualified name';
    END IF;
    IF (NOT RLIKE(v_metric, '^[A-Za-z0-9_]+$')) THEN
        RETURN 'skipped: invalid metric_version';
    END IF;

    -- Run names must be unique per semantic view, and the SCHEDULE is UTC, so the
    -- name is stamped in UTC too (CURRENT_DATE() would follow the session's
    -- timezone and could disagree with the cron's day). Minute precision keeps a
    -- manual EXECUTE TASK from colliding with the same day's scheduled run.
    LET v_run_name STRING := 'agentops_weekly_' || TO_VARCHAR(CONVERT_TIMEZONE('UTC', CURRENT_TIMESTAMP())::TIMESTAMP_NTZ, 'YYYYMMDDHH24MI');
    LET v_cfg_path STRING := '@{{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_CONFIG_STAGE/analyst_evaluation_config.yaml';

    -- 1. Regenerate the config YAML from the config row so the file on the stage
    --    can never drift from the settings the task is actually using.
    LET v_yaml STRING :=
        'evaluation:\n' ||
        '  analyst_params:\n' ||
        '    analyst_name: "' || :v_sv || '"\n' ||
        '    analyst_type: "SEMANTIC VIEW"\n' ||
        '  source_metadata:\n' ||
        '    type: "verified_queries"\n' ||
        '\n' ||
        'metrics:\n' ||
        '  - name: "sql_correctness"\n' ||
        '    version: "' || :v_metric || '"\n';

    -- $$ quoting keeps the YAML's own double quotes intact.
    EXECUTE IMMEDIATE
        'COPY INTO @{{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_CONFIG_STAGE/analyst_evaluation_config.yaml
         FROM (SELECT $$' || :v_yaml || '$$)
         FILE_FORMAT = (FORMAT_NAME = {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FF_EVAL_CONFIG_YAML)
         SINGLE = TRUE OVERWRITE = TRUE';

    -- 2. The evaluation creates a dataset (<view>_SYSTEM_EVAL) in the CURRENT
    --    schema and fails outright if the session has none, so pin it here. The
    --    task owner therefore needs CREATE DATASET on this schema.
    EXECUTE IMMEDIATE 'USE SCHEMA {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}';

    -- 3. Submit the run (returns immediately).
    CALL EXECUTE_AI_EVALUATION('START', OBJECT_CONSTRUCT('run_name', :v_run_name), :v_cfg_path);

    -- 4. Poll until the run reaches a terminal state or the cap is hit. The
    --    terminal set is matched loosely so a new success token in a future
    --    release cannot turn this into an infinite loop.
    LET v_status STRING := 'SUBMITTED';
    LET v_waited INTEGER := 0;
    WHILE (v_waited < v_max_wait AND NOT (v_status IN ('SUCCESS', 'SUCCEEDED', 'DONE', 'COMPLETED', 'FAILED', 'CANCELLED', 'ERROR'))) DO
        CALL SYSTEM$WAIT(1, 'MINUTES');
        CALL EXECUTE_AI_EVALUATION('STATUS', OBJECT_CONSTRUCT('run_name', :v_run_name), :v_cfg_path);
        v_status := (SELECT MAX("STATUS") FROM TABLE(RESULT_SCAN(LAST_QUERY_ID())));
        v_waited := v_waited + 1;
    END WHILE;

    IF (v_status IN ('FAILED', 'CANCELLED', 'ERROR')) THEN
        RETURN 'evaluation ' || :v_status || ' for run ' || :v_run_name;
    END IF;
    IF (NOT (v_status IN ('SUCCESS', 'SUCCEEDED', 'DONE', 'COMPLETED'))) THEN
        RETURN 'timed out after ' || :v_max_wait || ' min, last status ' || COALESCE(:v_status, 'unknown');
    END IF;

    -- 5. Collect per-question results into one summary row. GET_ANALYST_AI_
    --    EVALUATION_DATA takes the view's parts separately, hence SPLIT_PART.
    --    Scores are normalised so a 0-1 or a 0-100 scale both work, and HAVING
    --    COUNT(*) > 0 means a run that produced no records writes nothing.
    EXECUTE IMMEDIATE
        'INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SCHEDULED_EVAL_RUNS
             (run_type, environment, target_name, accuracy_pct, threshold_pct, passed_threshold,
              total_questions, passed_questions, failed_questions, run_details)
         WITH d AS (
             SELECT
                 IFF(EVAL_AGG_SCORE > 1, EVAL_AGG_SCORE / 100.0, EVAL_AGG_SCORE) AS norm,
                 INPUT, ERROR
             FROM TABLE(SNOWFLAKE.LOCAL.GET_ANALYST_AI_EVALUATION_DATA(
                 ''' || SPLIT_PART(:v_sv, '.', 1) || ''', ''' || SPLIT_PART(:v_sv, '.', 2) || ''',
                 ''' || SPLIT_PART(:v_sv, '.', 3) || ''', ''SEMANTIC VIEW'', ''' || :v_run_name || '''))
             WHERE METRIC_NAME = ''sql_correctness''
         )
         SELECT
             ''scheduled_weekly'',
             ''' || :v_env || ''',
             ''' || :v_sv || ''',
             ROUND(100.0 * COUNT_IF(norm >= 0.5) / NULLIF(COUNT(*), 0), 1),
             ' || :v_threshold || ',
             ROUND(100.0 * COUNT_IF(norm >= 0.5) / NULLIF(COUNT(*), 0), 1) >= ' || :v_threshold || ',
             COUNT(*),
             COUNT_IF(norm >= 0.5),
             COUNT(*) - COUNT_IF(norm >= 0.5),
             OBJECT_CONSTRUCT(
                 ''run_name'', ''' || :v_run_name || ''',
                 ''metric_version'', ''' || :v_metric || ''',
                 ''failures'', ARRAY_COMPACT(ARRAY_AGG(IFF(norm < 0.5 OR norm IS NULL,
                     OBJECT_CONSTRUCT(''question'', INPUT, ''error'', ERROR), NULL)))
             )
         FROM d
         HAVING COUNT(*) > 0';

    RETURN 'evaluated ' || :v_run_name;
END;

-- ----------------------------------------------------------------------------
-- To turn this on (both steps are required):
--   UPDATE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.EVAL_SCHEDULE_CONFIG
--      SET semantic_view = '<DB>.<SCHEMA>.<VIEW>', is_enabled = TRUE
--    WHERE config_id = 'default';
--   ALTER TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_WEEKLY_EVALUATION RESUME;
--
-- To run once without scheduling it:
--   EXECUTE TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_WEEKLY_EVALUATION;
--
-- The task owner needs, under ONE primary role (tasks ignore secondary roles):
--   SNOWFLAKE.CORTEX_USER, USE AI FUNCTIONS, EXECUTE TASK ON ACCOUNT,
--   CREATE DATASET on this schema, SELECT + MONITOR on the semantic view.
--
-- The semantic view must declare data_type on every fact. Without it the
-- evaluation fails with "Required field 'data_type' in Fact is missing" (392700)
-- when it serialises the view to model YAML -- note that plain Cortex Analyst
-- calls tolerate the omission, so a view can work in the agent yet fail here.
-- ----------------------------------------------------------------------------
