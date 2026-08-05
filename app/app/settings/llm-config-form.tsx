"use client"

import * as React from "react"
import Card from "@mui/material/Card"
import CardContent from "@mui/material/CardContent"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import MenuItem from "@mui/material/MenuItem"
import Switch from "@mui/material/Switch"
import FormControlLabel from "@mui/material/FormControlLabel"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import Divider from "@mui/material/Divider"
import Grid from "@mui/material/Grid"

export interface LlmConfig {
  is_enabled: boolean
  model: string
  resolution_prompt: string
  sampling_mode: "ALL" | "SAMPLE"
  sample_rate: number
  max_rows_per_run: number
  schedule_cron: string
  updated_by: string | null
  updated_at: string | null
}

const CRON_FIELD = /^[0-9*,/-]+$/
function cronValid(cron: string): boolean {
  const f = cron.trim().split(/\s+/)
  return f.length === 5 && f.every((x) => CRON_FIELD.test(x))
}

// Schedule is edited as "every N <unit>" and mapped to cron (UTC). The API
// still receives/validates a cron string; these helpers convert both ways.
type Unit = "minutes" | "hours" | "days" | "weeks"

const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: "minutes", label: "Minute(s)" },
  { value: "hours", label: "Hour(s)" },
  { value: "days", label: "Day(s)" },
  { value: "weeks", label: "Week(s)" },
]

// Max step per unit that standard cron can express in one field.
const UNIT_MAX: Record<Unit, number> = { minutes: 59, hours: 23, days: 31, weeks: 1 }

function clampNum(n: number, unit: Unit): number {
  const v = Math.floor(Number.isFinite(n) ? n : 1)
  return Math.min(Math.max(v, 1), UNIT_MAX[unit])
}

function cronFromParts(num: number, unit: Unit): string {
  const n = clampNum(num, unit)
  switch (unit) {
    case "minutes":
      return `*/${n} * * * *`
    case "hours":
      return `0 */${n} * * *`
    case "days":
      return `0 0 */${n} * *`
    case "weeks":
      return `0 0 * * 0` // cron can't express multi-week; weekly (Sunday)
  }
}

function partsFromCron(cron: string): { num: number; unit: Unit } {
  const f = cron.trim().split(/\s+/)
  if (f.length === 5) {
    const [min, hr, dom, , dow] = f
    let m: RegExpExecArray | null
    if ((m = /^\*\/(\d+)$/.exec(min)) && hr === "*" && dom === "*") return { num: +m[1], unit: "minutes" }
    if (min === "0" && (m = /^\*\/(\d+)$/.exec(hr)) && dom === "*") return { num: +m[1], unit: "hours" }
    if (min === "0" && hr === "0" && (m = /^\*\/(\d+)$/.exec(dom))) return { num: +m[1], unit: "days" }
    if (min === "0" && hr === "0" && dom === "*" && dow === "0") return { num: 1, unit: "weeks" }
  }
  return { num: 30, unit: "minutes" } // fallback (also the seeded default */30)
}

export function LlmConfigForm({
  initial,
  models,
  taskExists,
}: {
  initial: LlmConfig
  models: string[]
  taskExists: boolean
}) {
  const [cfg, setCfg] = React.useState<LlmConfig>(initial)
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState<{ kind: "success" | "error"; msg: string; warnings?: string[] } | null>(null)

  // Schedule builder state ("every N <unit>"), derived from the stored cron.
  const initialParts = partsFromCron(initial.schedule_cron)
  const [schedNum, setSchedNum] = React.useState<number>(initialParts.num)
  const [schedUnit, setSchedUnit] = React.useState<Unit>(initialParts.unit)

  function applySchedule(num: number, unit: Unit) {
    const n = clampNum(num, unit)
    setSchedNum(unit === "weeks" ? 1 : n)
    setSchedUnit(unit)
    set("schedule_cron", cronFromParts(n, unit))
  }

  function set<K extends keyof LlmConfig>(key: K, value: LlmConfig[K]) {
    setCfg((c) => ({ ...c, [key]: value }))
    setResult(null)
  }

  const cronOk = cronValid(cfg.schedule_cron)
  const modelOk = /^[A-Za-z0-9._-]+$/.test(cfg.model.trim()) && cfg.model.trim().length <= 100
  const promptsOk = cfg.resolution_prompt.trim().length > 0
  const rateOk = cfg.sample_rate >= 0 && cfg.sample_rate <= 1
  const rowsOk = Number.isInteger(cfg.max_rows_per_run) && cfg.max_rows_per_run > 0
  const canSave = cronOk && modelOk && promptsOk && rateOk && rowsOk && !saving

  async function onSave() {
    setSaving(true)
    setResult(null)
    try {
      const res = await fetch("/api/llm-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ kind: "error", msg: data.error ?? "Save failed" })
      } else {
        setResult({ kind: "success", msg: "Settings saved.", warnings: data.warnings })
      }
    } catch (e) {
      setResult({ kind: "error", msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={3}>
      {result?.kind === "success" ? (
        <Alert severity={result.warnings && result.warnings.length ? "warning" : "success"}>
          {result.msg}
          {result.warnings?.map((w, i) => (
            <div key={i}>{w}</div>
          ))}
        </Alert>
      ) : null}
      {result?.kind === "error" ? <Alert severity="error">{result.msg}</Alert> : null}

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box_Header title="Assessment" subtitle="Turn scoring on/off and choose the Cortex model" />
            <FormControlLabel
              control={<Switch checked={cfg.is_enabled} onChange={(e) => set("is_enabled", e.target.checked)} />}
              label="Enable LLM feedback scoring"
            />
            {models.length > 0 ? (
              // Dropdown of Cortex models available in this account. The current
              // value is pinned as an option even if filtered out of the list.
              <TextField
                select
                label="Model"
                value={cfg.model}
                onChange={(e) => set("model", e.target.value)}
                error={!modelOk}
                helperText="Cortex models available in this account (SNOWFLAKE.MODELS)"
                sx={{ maxWidth: 360 }}
              >
                {!models.includes(cfg.model) && cfg.model ? (
                  <MenuItem value={cfg.model}>{`${cfg.model} (current)`}</MenuItem>
                ) : null}
                {models.map((m) => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              // Fallback: model list unavailable (permissions/region) — free text.
              <TextField
                label="Model"
                value={cfg.model}
                onChange={(e) => set("model", e.target.value)}
                error={!modelOk}
                helperText={
                  modelOk
                    ? "Cortex COMPLETE model name, e.g. llama3.1-8b (must be available in your region)"
                    : "Letters, numbers, dot, dash or underscore only"
                }
                sx={{ maxWidth: 360 }}
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box_Header
              title="Prompt"
              subtitle="Sent with the user question and agent response appended. Ask for a short explanation — it is stored for audit and AI_CLASSIFY derives the YES/NO verdict from it."
            />
            <TextField
              label="Query-resolution prompt"
              helperText="Should elicit a brief explanation of whether the question was answered"
              value={cfg.resolution_prompt}
              onChange={(e) => set("resolution_prompt", e.target.value)}
              error={!cfg.resolution_prompt.trim()}
              multiline
              minRows={2}
              fullWidth
            />
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box_Header title="Sampling" subtitle="Score every unscored row, or a bounded sample per run" />
            <TextField
              select
              label="Mode"
              value={cfg.sampling_mode}
              onChange={(e) => set("sampling_mode", e.target.value as "ALL" | "SAMPLE")}
              sx={{ maxWidth: 360 }}
            >
              <MenuItem value="ALL">All unscored rows</MenuItem>
              <MenuItem value="SAMPLE">Sample</MenuItem>
            </TextField>
            {cfg.sampling_mode === "SAMPLE" ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Sample rate (0–1)"
                    type="number"
                    inputProps={{ min: 0, max: 1, step: 0.05 }}
                    value={cfg.sample_rate}
                    onChange={(e) => set("sample_rate", Number(e.target.value))}
                    error={!rateOk}
                    fullWidth
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label="Max rows per run"
                    type="number"
                    inputProps={{ min: 1, step: 50 }}
                    value={cfg.max_rows_per_run}
                    onChange={(e) => set("max_rows_per_run", Number(e.target.value))}
                    error={!rowsOk}
                    fullWidth
                  />
                </Grid>
              </Grid>
            ) : null}
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={3}>
            <Box_Header title="Schedule" subtitle="How often the scoring task runs (UTC)" />
            {!taskExists ? (
              <Alert severity="info">
                The scoring task isn&apos;t installed (automation module). The schedule will be saved but only
                takes effect once <code>automation</code> is installed.
              </Alert>
            ) : null}
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
              <TextField
                type="number"
                label="Every"
                value={schedUnit === "weeks" ? 1 : schedNum}
                disabled={schedUnit === "weeks"}
                onChange={(e) => applySchedule(Number(e.target.value), schedUnit)}
                inputProps={{ min: 1, max: UNIT_MAX[schedUnit], step: 1 }}
                sx={{ width: 120 }}
              />
              <TextField
                select
                label="Frequency"
                value={schedUnit}
                onChange={(e) => applySchedule(schedNum, e.target.value as Unit)}
                sx={{ minWidth: 180 }}
              >
                {UNIT_OPTIONS.map((u) => (
                  <MenuItem key={u.value} value={u.value}>
                    {u.label}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Typography color="text.secondary" variant="body2">
              {schedUnit === "weeks"
                ? "Runs weekly on Sunday (cron cannot express multi-week intervals)."
                : `Runs every ${clampNum(schedNum, schedUnit)} ${schedUnit} — cron ${cfg.schedule_cron} (UTC).`}
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Divider />
      <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
        <Button variant="contained" onClick={onSave} disabled={!canSave}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {cfg.updated_by ? (
          <Typography color="text.secondary" variant="body2">
            Last updated by {cfg.updated_by}
            {cfg.updated_at ? ` at ${cfg.updated_at}` : ""}
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  )
}

function Box_Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <Typography variant="h6">{title}</Typography>
      {subtitle ? (
        <Typography color="text.secondary" variant="body2">
          {subtitle}
        </Typography>
      ) : null}
    </div>
  )
}
