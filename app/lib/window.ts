// Shared time-window selector state. The dashboard's charts and KPI periods read
// a `?window=` URL param so the choice persists across pages and is shareable.

export type WindowKey = "7d" | "30d" | "90d"

export interface WindowSpec {
  key: WindowKey
  days: number
  label: string
}

export const WINDOW_OPTIONS: WindowSpec[] = [
  { key: "7d", days: 7, label: "Last 7 days" },
  { key: "30d", days: 30, label: "Last 30 days" },
  { key: "90d", days: 90, label: "Last 90 days" },
]

const DEFAULT: WindowKey = "30d"

/** Resolve a raw query-param value to a WindowSpec (defaults to 30d). */
export function parseWindow(raw: string | undefined): WindowSpec {
  const match = WINDOW_OPTIONS.find((w) => w.key === raw)
  return match ?? WINDOW_OPTIONS.find((w) => w.key === DEFAULT)!
}
