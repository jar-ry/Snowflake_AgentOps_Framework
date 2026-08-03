-- ============================================================================
-- Module: automation / 010_tasks.sql
-- Scheduled tasks that populate the monitoring tables daily. Requires
-- {{WAREHOUSE}}. Tasks are created SUSPENDED by default; resume them with
-- ALTER TASK ... RESUME (see docs/how-to/choose-modules.md).
-- ============================================================================

-- Task: Daily usage & token cost aggregation from usage history
CREATE OR REPLACE TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_USAGE_AGGREGATION
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 0 2 * * * UTC'
    COMMENT = 'Daily aggregation of agent usage/cost (main, per-user, per-model) from CORTEX_AGENT + SNOWFLAKE_INTELLIGENCE usage history'
AS
BEGIN
    -- 1. Main daily summary (agent-grain, both sources combined)
    MERGE INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS tgt
    USING (
        SELECT
            START_TIME::DATE                                                              AS metric_date,
            AGENT_DATABASE_NAME                                                          AS environment,
            'cortex_agent'                                                               AS service_type,
            AGENT_NAME                                                                   AS agent_or_sv_name,
            COUNT(*)                                                                     AS total_requests,
            COUNT(*)                                                                     AS successful_requests,
            0                                                                            AS failed_requests,
            SUM(TOKENS)                                                                  AS total_input_tokens,
            0                                                                            AS total_output_tokens,
            SUM(TOKENS)                                                                  AS total_tokens,
            0                                                                            AS total_cache_read_tokens,
            SUM(TOKEN_CREDITS)                                                           AS estimated_credits,
            AVG(DATEDIFF('millisecond', START_TIME, END_TIME))                           AS avg_latency_ms,
            APPROX_PERCENTILE(DATEDIFF('millisecond', START_TIME, END_TIME), 0.5)        AS p50_latency_ms,
            APPROX_PERCENTILE(DATEDIFF('millisecond', START_TIME, END_TIME), 0.95)       AS p95_latency_ms,
            APPROX_PERCENTILE(DATEDIFF('millisecond', START_TIME, END_TIME), 0.99)       AS p99_latency_ms,
            COUNT(DISTINCT USER_NAME)                                                    AS unique_users
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_SOURCE
        WHERE START_TIME::DATE = CURRENT_DATE() - 1
        GROUP BY 1, 2, 3, 4
    ) src
    ON tgt.metric_date = src.metric_date
       AND tgt.environment = src.environment
       AND tgt.agent_or_sv_name = src.agent_or_sv_name
    WHEN MATCHED THEN UPDATE SET
        tgt.total_requests = src.total_requests,
        tgt.successful_requests = src.successful_requests,
        tgt.failed_requests = src.failed_requests,
        tgt.total_input_tokens = src.total_input_tokens,
        tgt.total_output_tokens = src.total_output_tokens,
        tgt.total_tokens = src.total_tokens,
        tgt.estimated_credits = src.estimated_credits,
        tgt.avg_latency_ms = src.avg_latency_ms,
        tgt.p50_latency_ms = src.p50_latency_ms,
        tgt.p95_latency_ms = src.p95_latency_ms,
        tgt.p99_latency_ms = src.p99_latency_ms,
        tgt.unique_users = src.unique_users,
        tgt.collected_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        metric_date, environment, service_type, agent_or_sv_name,
        total_requests, successful_requests, failed_requests,
        total_input_tokens, total_output_tokens, total_tokens, total_cache_read_tokens,
        estimated_credits, avg_latency_ms, p50_latency_ms, p95_latency_ms, p99_latency_ms, unique_users
    ) VALUES (
        src.metric_date, src.environment, src.service_type, src.agent_or_sv_name,
        src.total_requests, src.successful_requests, src.failed_requests,
        src.total_input_tokens, src.total_output_tokens, src.total_tokens, src.total_cache_read_tokens,
        src.estimated_credits, src.avg_latency_ms, src.p50_latency_ms, src.p95_latency_ms, src.p99_latency_ms, src.unique_users
    );

    -- 2. Per-user attribution
    DELETE FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_USER WHERE metric_date = CURRENT_DATE() - 1;
    INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_USER
        (metric_date, environment, agent_or_sv_name, user_name, source, total_requests, total_tokens, estimated_credits)
    SELECT START_TIME::DATE, AGENT_DATABASE_NAME, AGENT_NAME, COALESCE(USER_NAME, 'unknown'), source,
           COUNT(*), SUM(TOKENS), SUM(TOKEN_CREDITS)
    FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_SOURCE
    WHERE START_TIME::DATE = CURRENT_DATE() - 1
    GROUP BY 1, 2, 3, 4, 5;

    -- 3. Per-model breakdown (flatten CREDITS_GRANULAR + TOKENS_GRANULAR)
    DELETE FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_MODEL WHERE metric_date = CURRENT_DATE() - 1;
    INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS_BY_MODEL
        (metric_date, environment, agent_or_sv_name, model_name, total_requests,
         input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, estimated_credits)
    SELECT
        h.START_TIME::DATE, h.AGENT_DATABASE_NAME, h.AGENT_NAME, cmdl.key::STRING,
        COUNT(DISTINCT creq.value),
        SUM(COALESCE(tmdl.value:"input"::INT,0)), SUM(COALESCE(tmdl.value:"output"::INT,0)),
        SUM(COALESCE(tmdl.value:"cache_read_input"::INT,0)), SUM(COALESCE(tmdl.value:"cache_write_input"::INT,0)),
        SUM(COALESCE(tmdl.value:"input"::INT,0) + COALESCE(tmdl.value:"output"::INT,0)
            + COALESCE(tmdl.value:"cache_read_input"::INT,0) + COALESCE(tmdl.value:"cache_write_input"::INT,0)),
        SUM(COALESCE(cmdl.value:"input"::FLOAT,0) + COALESCE(cmdl.value:"output"::FLOAT,0)
            + COALESCE(cmdl.value:"cache_read_input"::FLOAT,0) + COALESCE(cmdl.value:"cache_write_input"::FLOAT,0))
    FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_SOURCE h,
         LATERAL FLATTEN(input => h.CREDITS_GRANULAR) creq,
         LATERAL FLATTEN(input => creq.value) creq_obj,
         LATERAL FLATTEN(input => creq_obj.value) csvc,
         LATERAL FLATTEN(input => csvc.value) cmdl,
         LATERAL FLATTEN(input => h.TOKENS_GRANULAR) treq,
         LATERAL FLATTEN(input => treq.value) treq_obj,
         LATERAL FLATTEN(input => treq_obj.value) tsvc,
         LATERAL FLATTEN(input => tsvc.value) tmdl
    WHERE h.START_TIME::DATE = CURRENT_DATE() - 1
      AND csvc.key IN ('cortex_agents', 'cortex_analyst', 'cortex_functions')
      AND treq.seq = creq.seq AND tsvc.key = csvc.key AND tmdl.key = cmdl.key
    GROUP BY 1, 2, 3, 4;
END;

-- Task: Daily feedback sentiment analysis + rollup
CREATE OR REPLACE TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_FEEDBACK_ANALYSIS
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 15 2 * * * UTC'
    COMMENT = 'Daily feedback sentiment scoring and summary rollup'
AS
    MERGE INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY tgt
    USING (
        SELECT
            created_at::DATE                                             AS summary_date,
            environment,
            agent_or_sv_name,
            COUNT(*)                                                     AS total_feedback,
            COUNT_IF(feedback_rating >= 4)                               AS positive_count,
            COUNT_IF(feedback_rating = 3)                                AS neutral_count,
            COUNT_IF(feedback_rating <= 2)                               AS negative_count,
            AVG(feedback_rating)                                         AS avg_rating,
            AVG(sentiment_score)                                         AS avg_sentiment_score,
            ROUND(COUNT_IF(feedback_rating <= 2) * 100.0 / NULLIF(COUNT(*), 0), 2) AS negative_pct
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USER_FEEDBACK
        WHERE created_at::DATE = CURRENT_DATE() - 1
        GROUP BY 1, 2, 3
    ) src
    ON tgt.summary_date = src.summary_date
       AND tgt.environment = src.environment
       AND tgt.agent_or_sv_name = src.agent_or_sv_name
    WHEN MATCHED THEN UPDATE SET
        tgt.total_feedback = src.total_feedback,
        tgt.positive_count = src.positive_count,
        tgt.neutral_count = src.neutral_count,
        tgt.negative_count = src.negative_count,
        tgt.avg_rating = src.avg_rating,
        tgt.avg_sentiment_score = src.avg_sentiment_score,
        tgt.negative_pct = src.negative_pct,
        tgt.computed_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        summary_date, environment, agent_or_sv_name,
        total_feedback, positive_count, neutral_count, negative_count,
        avg_rating, avg_sentiment_score, negative_pct
    ) VALUES (
        src.summary_date, src.environment, src.agent_or_sv_name,
        src.total_feedback, src.positive_count, src.neutral_count, src.negative_count,
        src.avg_rating, src.avg_sentiment_score, src.negative_pct
    );

-- Task: Daily interaction quality scan
CREATE OR REPLACE TASK {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_INTERACTION_QUALITY
    WAREHOUSE = {{WAREHOUSE}}
    SCHEDULE = 'USING CRON 30 2 * * * UTC'
    COMMENT = 'Daily scan of agent interactions for quality issues'
AS
    MERGE INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY tgt
    USING (
        SELECT
            CURRENT_DATE() - 1                                          AS summary_date,
            database_name                                               AS environment,
            agent_name,
            COUNT(*)                                                     AS total_requests,
            0                                                           AS total_threads,
            COUNT_IF(flag_count > 0)                                     AS flagged_requests,
            0                                                           AS flagged_threads,
            COUNT_IF(flag_tool_looping)                                  AS tool_looping_count,
            COUNT_IF(flag_excessive_steps)                               AS excessive_steps_count,
            COUNT_IF(flag_slow_request)                                  AS slow_request_count,
            COUNT_IF(flag_high_token_burn)                               AS high_token_burn_count,
            COUNT_IF(flag_planning_error)                                AS planning_error_count,
            0                                                           AS single_turn_dropoff_count,
            0                                                           AS rapid_rephrasing_count,
            0                                                           AS abandoned_count,
            COUNT_IF(flag_planning_error OR (flag_tool_looping AND flag_high_token_burn)) AS critical_count,
            COUNT_IF(flag_count > 0 AND NOT (flag_planning_error OR (flag_tool_looping AND flag_high_token_burn))) AS warning_count,
            ROUND(COUNT_IF(flag_count > 0) * 100.0 / NULLIF(COUNT(*), 0), 2) AS flagged_request_pct
        FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_REQUEST_QUALITY_SIGNALS
        WHERE request_start >= DATEADD('day', -1, CURRENT_DATE())
          AND request_start < CURRENT_DATE()
        GROUP BY 1, 2, 3
    ) src
    ON tgt.summary_date = src.summary_date
       AND tgt.environment = src.environment
       AND tgt.agent_name = src.agent_name
    WHEN MATCHED THEN UPDATE SET
        tgt.total_requests = src.total_requests,
        tgt.flagged_requests = src.flagged_requests,
        tgt.tool_looping_count = src.tool_looping_count,
        tgt.excessive_steps_count = src.excessive_steps_count,
        tgt.slow_request_count = src.slow_request_count,
        tgt.high_token_burn_count = src.high_token_burn_count,
        tgt.planning_error_count = src.planning_error_count,
        tgt.critical_count = src.critical_count,
        tgt.warning_count = src.warning_count,
        tgt.flagged_request_pct = src.flagged_request_pct,
        tgt.computed_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (
        summary_date, environment, agent_name,
        total_requests, total_threads, flagged_requests, flagged_threads,
        tool_looping_count, excessive_steps_count, slow_request_count,
        high_token_burn_count, planning_error_count,
        single_turn_dropoff_count, rapid_rephrasing_count, abandoned_count,
        critical_count, warning_count, flagged_request_pct
    ) VALUES (
        src.summary_date, src.environment, src.agent_name,
        src.total_requests, src.total_threads, src.flagged_requests, src.flagged_threads,
        src.tool_looping_count, src.excessive_steps_count, src.slow_request_count,
        src.high_token_burn_count, src.planning_error_count,
        src.single_turn_dropoff_count, src.rapid_rephrasing_count, src.abandoned_count,
        src.critical_count, src.warning_count, src.flagged_request_pct
    );
