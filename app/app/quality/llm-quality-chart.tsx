"use client"

import * as React from "react"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Chip from "@mui/material/Chip"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"

import { LineChartCard } from "../components/cards/chart-cards"

/**
 * AI Quality Score chart with drill-down. Clicking a point sets `?day=YYYY-MM-DD`
 * (preserving the other filters) so the page can scope the unresolved-interactions
 * table to that day — i.e. click a dip to see why it dipped.
 *
 * This wrapper exists because quality/page.tsx is a server component and cannot
 * pass a click handler to the chart.
 */
export function LlmQualityChart({
  categories,
  values,
  day,
}: {
  categories: string[]
  values: (number | null)[]
  day?: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const setDay = React.useCallback(
    (value: string | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) params.set("day", value)
      else params.delete("day")
      router.push(`${pathname}?${params.toString()}`)
    },
    [router, searchParams, pathname],
  )

  return (
    <LineChartCard
      title="AI Quality Score (LLM-Judged)"
      subheader="Was the query resolved? Click a point to inspect that day's unresolved interactions."
      categories={categories}
      series={[{ name: "Query Resolved %", data: values }]}
      format={{ suffix: "%" }}
      yMin={0}
      yMax={100}
      sparse
      onPointClick={(iso) => setDay(iso)}
      redrawKey={`llm-quality-${day ?? "all"}`}
      action={
        day ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography color="text.secondary" variant="body2">
              Showing
            </Typography>
            <Chip label={day} size="small" onDelete={() => setDay(null)} />
          </Stack>
        ) : null
      }
    />
  )
}
