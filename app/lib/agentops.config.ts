// Location of the AgentOps framework's monitoring objects that this dashboard
// queries (USAGE_METRICS, V_EVAL_ACCURACY_TREND, etc.). The dashboard queries
// these by unqualified name, so the app's Snowflake session must default to
// this database + schema (see the USE SCHEMA guard in lib/snowflake.ts).
//
// These ship EMPTY in the framework. The `bootstrap-from-existing` skill
// populates them from config/environments.yaml (framework.database /
// framework.schema) during setup, so each environment's deployed dashboard
// targets its own schema.
//
// Runtime env vars SNOWFLAKE_DATABASE / SNOWFLAKE_SCHEMA override these.
export const FRAMEWORK_DB = "FINANCE_AI_DEV"
export const FRAMEWORK_SCHEMA = "AGENTOPS"
