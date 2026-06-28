// Server-side error sanitizer.
//
// Logs the full error detail (with a short correlation ref) to stdout — captured
// by SPCS service logs in production and by the console in local dev — and returns
// a viewer-safe, friendly message for the UI.
//
// The UI must NEVER display raw SQL, schema/object names, or driver error text.
// Callers pass the caught error here and render only the returned string. The
// `ref` lets a user report a problem that an operator can grep back to the exact
// log line containing the full detail (queryId, driver message, stack).

/**
 * Log the full error server-side and return a safe, friendly message for the UI.
 *
 * @param context short label for where the failure happened (e.g. "overview")
 * @param e       the caught error (unknown — may not be an Error)
 * @returns a generic, viewer-safe message containing a correlation ref
 */
export function friendlyError(context: string, e: unknown): string {
  const ref = Math.random().toString(36).slice(2, 8)
  const detail = e instanceof Error ? (e.stack ?? e.message) : String(e)
  console.error(`[agentops] ${context} failed (ref=${ref}): ${detail}`)
  return `Unable to load this data right now. If this persists, contact your administrator (ref: ${ref}).`
}
