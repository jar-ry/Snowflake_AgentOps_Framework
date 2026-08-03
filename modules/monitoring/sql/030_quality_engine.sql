-- ============================================================================
-- Module: monitoring / 030_quality_engine.sql
-- Rules-based detection of problematic agent interactions (no LLM needed):
--   1. Tool call looping       (same tool called 3+ times in one request)
--   2. Excessive planning steps (4+ steps to resolve a query)
--   3. Slow requests           (total duration > 60s)
--   4. High token burn         (>100k tokens in a single request)
--   5. Planning errors         (any step with planning_status = 'ERROR')
--   6. Abandoned conversations (thread with 3+ turns, no follow-up in 30min)
--   7. Single-turn drop-off    (thread with exactly 1 turn)
--   8. Repeated rephrasing     (3+ messages in a thread quickly)
-- The INTERACTION_QUALITY_DAILY rollup table lives in 010_monitoring_tables.sql.
-- ============================================================================

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_REQUEST_QUALITY_SIGNALS AS
WITH request_spans AS (
    SELECT
        TRACE:trace_id::STRING                                                              AS trace_id,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.thread_id"::STRING                   AS thread_id,
        RECORD_ATTRIBUTES:"snow.ai.observability.database.name"::STRING                     AS database_name,
        RECORD_ATTRIBUTES:"snow.ai.observability.schema.name"::STRING                       AS schema_name,
        RECORD_ATTRIBUTES:"snow.ai.observability.object.name"::STRING                       AS agent_name,
        RECORD:name::STRING                                                                 AS span_name,
        RECORD:status.code::STRING                                                          AS status_code,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.status"::STRING             AS planning_status,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.step_number"::INTEGER       AS step_number,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.token_count.total"::INTEGER AS step_tokens,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.duration"::FLOAT            AS step_duration_ms,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.tool_selection.name"::STRING AS tool_selected,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.query"::STRING              AS user_query,
        START_TIMESTAMP,
        TIMESTAMP AS end_timestamp
    FROM snowflake.local.ai_observability_events
    WHERE RECORD_TYPE = 'SPAN'
      AND SCOPE:name::STRING = 'snow.cortex.agent'
      AND RECORD:name::STRING LIKE 'ReasoningAgentStepPlanning%'
),
tool_counts AS (
    SELECT
        trace_id,
        tool_selected,
        COUNT(*) AS call_count
    FROM request_spans
    WHERE tool_selected IS NOT NULL
    GROUP BY 1, 2
)
SELECT
    r.trace_id,
    MAX(r.thread_id)                                                    AS thread_id,
    MAX(r.database_name)                                                AS database_name,
    MAX(r.schema_name)                                                  AS schema_name,
    MAX(r.agent_name)                                                   AS agent_name,
    MAX(r.user_query)                                                   AS user_query,
    MIN(r.START_TIMESTAMP)                                              AS request_start,
    MAX(r.end_timestamp)                                                AS request_end,
    DATEDIFF('millisecond', MIN(r.START_TIMESTAMP), MAX(r.end_timestamp)) AS total_duration_ms,

    MAX(r.step_number)                                                  AS max_step,
    SUM(COALESCE(r.step_tokens, 0))                                     AS total_tokens,
    COUNT_IF(r.planning_status = 'ERROR')                               AS error_step_count,
    MAX(COALESCE(tc.max_same_tool_calls, 0))                            AS max_same_tool_calls,

    -- FLAGS
    IFF(MAX(COALESCE(tc.max_same_tool_calls, 0)) >= 3, TRUE, FALSE)     AS flag_tool_looping,
    IFF(MAX(r.step_number) >= 4, TRUE, FALSE)                           AS flag_excessive_steps,
    IFF(DATEDIFF('millisecond', MIN(r.START_TIMESTAMP), MAX(r.end_timestamp)) > 60000, TRUE, FALSE) AS flag_slow_request,
    IFF(SUM(COALESCE(r.step_tokens, 0)) > 100000, TRUE, FALSE)         AS flag_high_token_burn,
    IFF(COUNT_IF(r.planning_status = 'ERROR') > 0, TRUE, FALSE)        AS flag_planning_error,

    (IFF(MAX(COALESCE(tc.max_same_tool_calls, 0)) >= 3, 1, 0)
     + IFF(MAX(r.step_number) >= 4, 1, 0)
     + IFF(DATEDIFF('millisecond', MIN(r.START_TIMESTAMP), MAX(r.end_timestamp)) > 60000, 1, 0)
     + IFF(SUM(COALESCE(r.step_tokens, 0)) > 100000, 1, 0)
     + IFF(COUNT_IF(r.planning_status = 'ERROR') > 0, 1, 0))           AS flag_count

FROM request_spans r
LEFT JOIN (
    SELECT trace_id, MAX(call_count) AS max_same_tool_calls
    FROM tool_counts
    GROUP BY 1
) tc ON r.trace_id = tc.trace_id
GROUP BY r.trace_id;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_THREAD_QUALITY_SIGNALS AS
WITH thread_turns AS (
    SELECT
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.thread_id"::STRING   AS thread_id,
        TRACE:trace_id::STRING                                               AS trace_id,
        RECORD_ATTRIBUTES:"snow.ai.observability.object.name"::STRING        AS agent_name,
        RECORD_ATTRIBUTES:"snow.ai.observability.database.name"::STRING      AS database_name,
        RECORD_ATTRIBUTES:"snow.ai.observability.agent.planning.query"::STRING AS user_query,
        MIN(START_TIMESTAMP)                                                 AS turn_start,
        MAX(TIMESTAMP)                                                       AS turn_end
    FROM snowflake.local.ai_observability_events
    WHERE RECORD_TYPE = 'SPAN'
      AND SCOPE:name::STRING = 'snow.cortex.agent'
      AND RECORD:name::STRING = 'ReasoningAgentStepPlanning-0'
      AND RECORD_ATTRIBUTES:"snow.ai.observability.agent.thread_id" IS NOT NULL
    GROUP BY 1, 2, 3, 4, 5
),
thread_summary AS (
    SELECT
        thread_id,
        MAX(agent_name)                                             AS agent_name,
        MAX(database_name)                                          AS database_name,
        COUNT(DISTINCT trace_id)                                    AS turn_count,
        MIN(turn_start)                                             AS first_turn,
        MAX(turn_end)                                               AS last_turn,
        DATEDIFF('minute', MIN(turn_start), MAX(turn_end))          AS conversation_duration_min,
        AVG(DATEDIFF('second', turn_start, turn_end))               AS avg_turn_duration_sec
    FROM thread_turns
    GROUP BY thread_id
)
SELECT
    thread_id,
    agent_name,
    database_name,
    turn_count,
    first_turn,
    last_turn,
    conversation_duration_min,
    avg_turn_duration_sec,

    -- FLAGS
    IFF(turn_count = 1, TRUE, FALSE)                                            AS flag_single_turn_dropoff,
    IFF(turn_count >= 3 AND conversation_duration_min <= 5, TRUE, FALSE)        AS flag_rapid_rephrasing,
    IFF(turn_count >= 3
        AND DATEDIFF('minute', last_turn, CURRENT_TIMESTAMP()) > 30
        AND conversation_duration_min < 60, TRUE, FALSE)                        AS flag_abandoned_conversation,

    (IFF(turn_count = 1, 1, 0)
     + IFF(turn_count >= 3 AND conversation_duration_min <= 5, 1, 0)
     + IFF(turn_count >= 3
           AND DATEDIFF('minute', last_turn, CURRENT_TIMESTAMP()) > 30
           AND conversation_duration_min < 60, 1, 0))                          AS flag_count

FROM thread_summary;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_INTERACTION_QUALITY_FLAGS AS
SELECT signal_source, interaction_id, thread_id, environment,
       agent_name, user_query, event_time, total_duration_ms,
       total_tokens, steps, severity,
       flag_tool_looping, flag_excessive_steps, flag_slow_request,
       flag_high_token_burn, flag_planning_error
FROM (
    SELECT
        'request' AS signal_source,
        trace_id AS interaction_id,
        thread_id,
        database_name AS environment,
        agent_name,
        user_query,
        request_start AS event_time,
        total_duration_ms,
        total_tokens,
        max_step AS steps,
        flag_tool_looping,
        flag_excessive_steps,
        flag_slow_request,
        flag_high_token_burn,
        flag_planning_error,
        CASE
            WHEN flag_planning_error THEN 'CRITICAL'
            WHEN flag_tool_looping AND flag_high_token_burn THEN 'CRITICAL'
            WHEN flag_tool_looping OR flag_excessive_steps THEN 'WARNING'
            WHEN flag_slow_request OR flag_high_token_burn THEN 'WARNING'
            ELSE 'INFO'
        END AS severity
    FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_REQUEST_QUALITY_SIGNALS
    WHERE flag_count > 0
) sub
WHERE agent_name IS NOT NULL;

CREATE OR REPLACE VIEW {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_INTERACTION_QUALITY_DASHBOARD AS
SELECT
    summary_date,
    environment,
    agent_name,
    total_requests,
    total_threads,
    flagged_requests,
    flagged_request_pct,
    tool_looping_count,
    excessive_steps_count,
    slow_request_count,
    high_token_burn_count,
    planning_error_count,
    single_turn_dropoff_count,
    rapid_rephrasing_count,
    abandoned_count,
    critical_count,
    warning_count,
    AVG(flagged_request_pct) OVER (
        PARTITION BY environment, agent_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7d_flagged_pct,
    SUM(flagged_requests) OVER (
        PARTITION BY environment, agent_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7d_flagged_count,
    SUM(abandoned_count + rapid_rephrasing_count) OVER (
        PARTITION BY environment, agent_name
        ORDER BY summary_date
        ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
    ) AS rolling_7d_user_struggle_count
FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY;
