-- ============================================================================
-- Module: core / 010_schema.sql
-- Creates the single framework schema that houses all AgentOps objects.
-- This is the foundation every other module builds on.
--
-- Placeholders (substituted by setup/install.py):
--   {{FRAMEWORK_DB}}     - existing database to house framework objects
--   {{FRAMEWORK_SCHEMA}} - schema name (created if not exists)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS {{FRAMEWORK_DB}}.{{FRAMEWORK_SCHEMA}};
