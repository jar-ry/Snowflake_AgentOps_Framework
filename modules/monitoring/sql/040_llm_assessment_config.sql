-- ============================================================================
-- Module: monitoring / 040_llm_assessment_config.sql
-- Single-row config that drives the LLM feedback quality assessment
-- (TASK_LLM_FEEDBACK_SCORING in the automation module). Editable at runtime via
-- the dashboard Settings page (/api/llm-config) or directly in SQL.
--
--   prompt / model / sampling  -> read by the task at runtime (plain UPDATE to edit)
--   schedule_cron              -> mirrors the task SCHEDULE; changing it requires
--                                 ALTER TASK (the Settings API does this)
-- ============================================================================

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_ASSESSMENT_CONFIG (
    config_id           STRING DEFAULT 'default',   -- single logical row
    is_enabled          BOOLEAN DEFAULT TRUE,        -- data-driven on/off (no DDL to toggle)
    model               STRING  DEFAULT 'llama3.1-8b',
    resolution_prompt   STRING,                      -- asks for an EXPLANATION; AI_CLASSIFY derives YES/NO
    sampling_mode       STRING  DEFAULT 'ALL',       -- 'ALL' | 'SAMPLE'
    sample_rate         FLOAT   DEFAULT 1.0,         -- 0-1, used when sampling_mode = 'SAMPLE'
    max_rows_per_run    INTEGER DEFAULT 500,         -- cap per run when sampling_mode = 'SAMPLE'
    schedule_cron       STRING  DEFAULT '*/30 * * * *',
    updated_by          STRING,
    updated_at          TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Seed the single default row once (idempotent: no-op if it already exists).
-- Prompts ask for a short explanation (kept in LLM_ASSESSMENT_LOG for audit);
-- the YES/NO verdict is derived from that explanation by AI_CLASSIFY, so the
-- prompts deliberately do NOT demand a bare YES/NO.
INSERT INTO {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_ASSESSMENT_CONFIG
    (config_id, is_enabled, model, resolution_prompt,
     sampling_mode, sample_rate, max_rows_per_run, schedule_cron, updated_by)
SELECT
    'default', TRUE, 'llama3.1-8b',
    'In one or two sentences, explain whether the agent response fully answered the user question. End with a clear conclusion.',
    'ALL', 1.0, 500, '*/30 * * * *', 'install'
WHERE NOT EXISTS (
    SELECT 1 FROM {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_ASSESSMENT_CONFIG WHERE config_id = 'default'
);
