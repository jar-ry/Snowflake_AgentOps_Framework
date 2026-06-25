// Pure helpers for the global Environment filter (?env= URL param).
//
// Environment values are DATA-DRIVEN: the real set of environments is whatever
// distinct `environment` values exist in the target framework schema (a customer
// may have one, e.g. just PROD, or several). The list is fetched server-side in
// lib/environments.ts and passed to the pages and the filter UI.
//
// A single environment is always applied (no blended "All"): mixing environments
// would mis-aggregate per-series charts (pivot collisions, summed counts). When a
// "PROD"-like value is present it is the default; otherwise the first value wins.
//
// This module is intentionally pure (no server-only imports) so the client
// EnvironmentFilter component can import `pickEnv` too.

/**
 * Resolve a raw ?env= value against the available environment values.
 * - Returns the matching canonical value (case-insensitive) if `raw` is valid.
 * - Otherwise defaults to a "PROD"-like value if present, else the first value.
 * - Returns "" when no environments are available (caller omits the predicate).
 */
export function pickEnv(raw: string | undefined, values: string[]): string {
  if (!values || values.length === 0) return ""
  if (raw) {
    const match = values.find((v) => v.toUpperCase() === raw.toUpperCase())
    if (match) return match
  }
  const prod = values.find((v) => v.toUpperCase() === "PROD")
  return prod ?? values[0]
}
