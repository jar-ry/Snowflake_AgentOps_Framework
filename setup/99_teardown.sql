-- ============================================================================
-- 99_teardown.sql
-- Removes ALL framework objects created by 00_framework_tables.sql.
-- Run this to completely undo the bootstrap.
--
-- Order: Tasks → Alerts → Views → Tables → (optionally) Schema
--
-- Placeholders:
--   {{FRAMEWORK_DB}}     — database containing the framework schema
--   {{FRAMEWORK_SCHEMA}} — the framework schema name
-- ============================================================================

-- ============================================================================
-- TASKS (must be dropped before dependent views/tables)
-- ============================================================================

DROP TASK IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_USAGE_AGGREGATION;
DROP TASK IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_FEEDBACK_ANALYSIS;
DROP TASK IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.TASK_DAILY_INTERACTION_QUALITY;

-- ============================================================================
-- ALERTS
-- ============================================================================

DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_NEGATIVE_FEEDBACK_SPIKE;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_ACCURACY_REGRESSION;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_LATENCY_DEGRADATION;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_COST_ANOMALY;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_ERROR_SPIKE;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HEALTH_FAILURE;
DROP ALERT IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_INTERACTION_QUALITY;

-- ============================================================================
-- VIEWS (drop dependent views first, then base views)
-- ============================================================================

-- Interaction quality engine (depends on V_REQUEST_QUALITY_SIGNALS)
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_INTERACTION_QUALITY_DASHBOARD;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_INTERACTION_QUALITY_FLAGS;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_THREAD_QUALITY_SIGNALS;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_REQUEST_QUALITY_SIGNALS;

-- Monitoring trend views (depend on base tables)
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_WEEKLY_EXECUTIVE_SUMMARY;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_HEALTH_DASHBOARD;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_ACTIVE_ALERTS;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_TOKEN_COST_TREND;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_FEEDBACK_TREND;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_EVAL_ACCURACY_TREND;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.V_AGENT_USAGE_PATTERNS;

-- Observability base views (depend on snowflake.local.ai_observability_events)
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.AGENT_REQUEST_SUMMARY;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ANALYST_QUERIES;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_CALLS;
DROP VIEW IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.AGENT_TRACES;

-- ============================================================================
-- TABLES
-- ============================================================================

DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.INTERACTION_QUALITY_DAILY;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.FEEDBACK_DAILY_SUMMARY;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.ALERT_HISTORY;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.HEALTH_CHECK_RESULTS;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USAGE_METRICS;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SCHEDULED_EVAL_RUNS;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SEMANTIC_VIEW_EVAL_DETAILS;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.SEMANTIC_VIEW_EVAL_RUNS;
DROP TABLE IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.USER_FEEDBACK;

-- ============================================================================
-- SCHEMA (the framework created this schema — safe to drop)
-- ============================================================================

DROP SCHEMA IF EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}};
