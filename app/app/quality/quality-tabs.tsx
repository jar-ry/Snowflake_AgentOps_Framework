"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import Tabs from "@mui/material/Tabs"
import Tab from "@mui/material/Tab"
import Box from "@mui/material/Box"

export type QualityTab = "rules" | "ai"

/**
 * Sub-tabs for the Interaction Quality page. Driven by `?tab=` so the server
 * component renders (and queries) only the active section — the page was too
 * long with the rules-based and LLM-judge content stacked together.
 * Switching tabs clears `day` (a drill-down date only applies to the AI tab).
 */
export function QualityTabs({ value }: { value: QualityTab }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  function onChange(next: QualityTab) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === "rules") params.delete("tab")
    else params.set("tab", next)
    params.delete("day")
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 3 }}>
      <Tabs value={value} onChange={(_, v) => onChange(v as QualityTab)}>
        <Tab value="rules" label="Rules-based flags" />
        <Tab value="ai" label="AI judge (LLM)" />
      </Tabs>
    </Box>
  )
}
