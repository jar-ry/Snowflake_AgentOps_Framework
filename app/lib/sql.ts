// SQL safety helpers for dashboard pages.
//
// Page filters interpolate values into SQL WHERE fragments. The ?env= and
// ?window= params are already constrained to a fixed allowlist (see lib/env.ts
// and lib/window.ts), but ?agent= is user-supplied. Agent / target names in this
// schema are bare identifiers ([A-Z0-9_], e.g. SUPPORT_AGENT, ANALYTICS_SV), so
// we validate against a strict identifier pattern. Anything containing quotes,
// semicolons, whitespace, or comment markers fails validation and is dropped,
// which neutralizes SQL injection via the agent filter.

/**
 * Returns `v` only if it is a safe bare SQL identifier (letters, digits,
 * underscore, up to `maxLen` chars); otherwise returns `undefined`. A returned
 * `undefined` should be treated as "no agent filter".
 */
export function safeIdent(v: string | undefined, maxLen = 64): string | undefined {
  if (!v) return undefined
  return /^[A-Za-z0-9_]+$/.test(v) && v.length <= maxLen ? v : undefined
}
