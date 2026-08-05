-- ============================================================================
-- Module: monitoring / 050_llm_assessment_log.sql
-- Audit trail for the LLM feedback quality assessment. Every scoring run writes
-- one row per feedback item capturing the exact model, prompt, and the model's
-- free-text EXPLANATION, plus the verdict a classifier derived from it — so any
-- judgment on the dashboard can be traced back to the model's own reasoning.
--
-- Two-stage flow (see TASK_LLM_FEEDBACK_SCORING):
--   1. Cortex COMPLETE writes a free-text explanation  -> resolution_response
--   2. AI_CLASSIFY turns that explanation into YES/NO   -> resolution_verdict -> boolean
-- Stage 2 exists because models often ignore "reply only YES/NO" and answer in
-- prose; substring matching on the prose misclassified them.
--
-- The assessment judges ONE thing: was the user's question resolved. Perceived
-- sentiment is captured directly from users via USER_FEEDBACK.feedback_rating
-- (thumbs), which is a real signal rather than an LLM inference.
-- ============================================================================

CREATE TABLE IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_ASSESSMENT_LOG (
    log_id                 STRING DEFAULT UUID_STRING(),
    feedback_id            STRING,               -- FK to USER_FEEDBACK.feedback_id
    environment            STRING,
    agent_or_sv_name       STRING,
    user_query             STRING,
    agent_response         STRING,
    model                  STRING,               -- model used for the explanation
    resolution_prompt      STRING,               -- prompt template at scoring time
    resolution_response    STRING,               -- RAW explanation (audit)
    resolution_verdict     STRING,               -- AI_CLASSIFY label: YES / NO
    llm_query_resolved     BOOLEAN,              -- resolution_verdict = 'YES'
    scored_at              TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- Backfill columns on pre-existing installs (no-op if already present).
ALTER TABLE {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}}.LLM_ASSESSMENT_LOG ADD COLUMN IF NOT EXISTS resolution_verdict STRING;
