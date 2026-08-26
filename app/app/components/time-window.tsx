"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import TextField from "@mui/material/TextField"
import MenuItem from "@mui/material/MenuItem"
import { WINDOW_OPTIONS, DEFAULT_WINDOW } from "@/lib/window"

export function TimeWindow() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const current = searchParams.get("window") || DEFAULT_WINDOW

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    // The default needs no param, keeping shared URLs clean.
    if (value && value !== DEFAULT_WINDOW) {
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
