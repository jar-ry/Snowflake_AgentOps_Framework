// Location of the AgentOps framework's monitoring objects that this dashboard
// queries (USAGE_METRICS, V_EVAL_ACCURACY_TREND, etc.).
//
// These ship EMPTY in the framework. The `bootstrap-from-existing` /
// `agentops-configure` skills populate them from config/environments.yaml
// (framework.database / framework.schema) during setup, so each environment's
// deployed dashboard targets its own schema.
//
// Runtime env vars SNOWFLAKE_DATABASE / SNOWFLAKE_SCHEMA override these.
export const FRAMEWORK_DB = ""
export const FRAMEWORK_SCHEMA = ""

// Fully qualified schema prefix for SQL queries.
// When populated: "MY_DB.MY_SCHEMA." — when empty: "" (relies on session context).
export const S = FRAMEWORK_DB && FRAMEWORK_SCHEMA ? `${FRAMEWORK_DB}.${FRAMEWORK_SCHEMA}.` : ""

// Dashboard pages to expose. This is how the dashboard is made modular: only
// pages whose backing framework modules are installed should be listed here.
// The installer / configure skill rewrites this array based on selected modules
//   overview -> monitoring   accuracy -> evaluation   quality -> monitoring
//   cost     -> monitoring   feedback -> monitoring    alerts  -> alerts
// Disabled pages are hidden from the nav and render a "module not installed"
// notice if navigated to directly. Default: all pages enabled.
export type PageKey = "overview" | "accuracy" | "quality" | "cost" | "feedback" | "alerts"

export const ENABLED_PAGES: PageKey[] = [
  "overview",
  "accuracy",
  "quality",
  "cost",
  "feedback",
  "alerts",
]

export function isPageEnabled(key: PageKey): boolean {
  return ENABLED_PAGES.includes(key)
}
