"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import TextField from "@mui/material/TextField"
import MenuItem from "@mui/material/MenuItem"
import { StackIcon } from "@phosphor-icons/react/dist/ssr/Stack"
import InputAdornment from "@mui/material/InputAdornment"

import { pickEnv } from "@/lib/env"

/**
 * Global environment selector. Options are data-driven (passed from the server
 * layout, derived from distinct `environment` values in the target schema).
 * Renders nothing when there are fewer than two environments — a single-env
 * deployment has nothing to switch between.
 */
export function EnvironmentFilter({ options }: { options: string[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  if (!options || options.length < 2) return null

  const current = pickEnv(searchParams.get("env") || undefined, options)

  function onChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set("env", value)
    } else {
      params.delete("env")
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <TextField
      select
      size="small"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      sx={{ minWidth: 190, "& .MuiInputBase-root": { bgcolor: "var(--mui-palette-background-paper)" } }}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <StackIcon fontSize="var(--icon-fontSize-sm)" />
            </InputAdornment>
          ),
        },
      }}
    >
      {options.map((o) => (
        <MenuItem key={o} value={o}>
          {o.toLowerCase()}
        </MenuItem>
      ))}
    </TextField>
  )
}
