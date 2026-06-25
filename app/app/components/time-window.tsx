"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import TextField from "@mui/material/TextField"
import MenuItem from "@mui/material/MenuItem"
import { WINDOW_OPTIONS } from "@/lib/window"

export function TimeWindow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const current = searchParams.get("window") || "30d"

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== "30d") {
      params.set("window", value)
    } else {
      params.delete("window")
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <TextField
      select
      size="small"
      label="Window"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 140 }}
    >
      {WINDOW_OPTIONS.map((w) => (
        <MenuItem key={w.key} value={w.key}>{w.label}</MenuItem>
      ))}
    </TextField>
  )
}
