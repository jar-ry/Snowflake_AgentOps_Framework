// Server-side fetch of the distinct environment values present in the target
// framework schema. Used by the root layout (to populate the global filter) and
// by each page (to resolve the selected/default environment for its queries).
//
// Wrapped in React `cache()` so the layout and the page that render in the same
// request share a single round-trip rather than each issuing the query.

import { cache } from "react"

import { querySnowflake } from "./snowflake"

/** Distinct `environment` values in USAGE_METRICS, ordered. [] if unavailable. */
export const getEnvironments = cache(async (): Promise<string[]> => {
  try {
    const rows = await querySnowflake(
      "SELECT DISTINCT environment FROM USAGE_METRICS WHERE environment IS NOT NULL ORDER BY 1",
    )
    return rows.map((r: any) => r.ENVIRONMENT).filter(Boolean)
  } catch {
    // Schema not reachable / not yet populated — render without an env filter.
    return []
  }
})
