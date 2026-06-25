// Shared helpers for dashboard pages.

/** Normalize a Snowflake DATE/string value to "YYYY-MM-DD" for charting. */
export function toDateStr(v: unknown): string {
  if (v == null) return ""
  const s = String(v)
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s)
  if (m) return m[1]
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  return s
}

/**
 * Pivot long-format rows {date, seriesName, value} into chart rows
 * [{ DATE, [seriesName]: value, ... }] sorted by date ascending.
 * Returns the chart rows plus the ordered list of distinct series names.
 */
export function pivotByDate(
  rows: Record<string, any>[],
  dateField: string,
  seriesField: string,
  valueField: string,
): { data: Record<string, any>[]; seriesNames: string[] } {
  const byDate = new Map<string, Record<string, any>>()
  const seriesNames: string[] = []
  for (const r of rows) {
    const date = toDateStr(r[dateField])
    const name = String(r[seriesField])
    const val = Number(r[valueField])
    if (!byDate.has(date)) byDate.set(date, { DATE: date })
    byDate.get(date)![name] = Number.isFinite(val) ? val : null
    if (!seriesNames.includes(name)) seriesNames.push(name)
  }
  const data = Array.from(byDate.values()).sort((a, b) => (a.DATE < b.DATE ? -1 : 1))
  return { data, seriesNames: seriesNames.sort() }
}
