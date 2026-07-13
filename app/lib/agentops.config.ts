// Location of the AgentOps framework's monitoring objects that this dashboard
// queries (USAGE_METRICS, V_EVAL_ACCURACY_TREND, etc.).
//
// These ship EMPTY in the framework. The `bootstrap-from-existing` skill
// populates them from config/environments.yaml (framework.database /
// framework.schema) during setup, so each environment's deployed dashboard
// targets its own schema.
//
// Runtime env vars SNOWFLAKE_DATABASE / SNOWFLAKE_SCHEMA override these.
export const FRAMEWORK_DB = "BABY_MART_DEMO"
export const FRAMEWORK_SCHEMA = "AGENTOPS"
