import { NextResponse } from "next/server"

import { querySnowflake } from "@/lib/snowflake"
import { S } from "@/lib/agentops.config"

// The dashboard's only write path. Reads/updates the single LLM_ASSESSMENT_CONFIG
// row that drives TASK_LLM_FEEDBACK_SCORING. Prompt/model/sampling/enabled are a
// plain UPDATE; changing the schedule additionally issues ALTER TASK.
//
// Runs with owner's rights (the service role owns the config table + task), so
// access is governed by who can reach the app. All inputs are validated and the
// prompt/model/sampling values are written via bind parameters (no SQL string
// interpolation); the cron is validated against a strict allow-list before it
// is placed into ALTER TASK.

export const dynamic = "force-dynamic"

const TASK = `${S}TASK_LLM_FEEDBACK_SCORING`
const CONFIG = `${S}LLM_ASSESSMENT_CONFIG`

// Model is a free-text Cortex model name. It is interpolated into the scoring
// task's dynamic SQL as a string literal, so restrict it to a safe charset
// (matches the task's own RLIKE guard). We do NOT allow-list specific models —
// availability varies by region/account, so the operator types the one they want.
const MODEL_RE = /^[A-Za-z0-9._-]+$/
const MAX_MODEL_LEN = 100

const SAMPLING_MODES = new Set(["ALL", "SAMPLE"])
const MAX_PROMPT_LEN = 4000

// A single cron field: digits, *, ranges, steps, lists. No spaces/quotes.
const CRON_FIELD = /^[0-9*,/-]+$/

function validateCron(cron: unknown): string | null {
  if (typeof cron !== "string") return null
  const trimmed = cron.trim()
  const fields = trimmed.split(/\s+/)
  if (fields.length !== 5) return null
  if (!fields.every((f) => CRON_FIELD.test(f))) return null
  return trimmed
}

export async function GET() {
  try {
    const rows = await querySnowflake(
      `SELECT config_id, is_enabled, model, resolution_prompt,
              sampling_mode, sample_rate, max_rows_per_run, schedule_cron, updated_by, updated_at
       FROM ${CONFIG} WHERE config_id = 'default'`,
    )
    return NextResponse.json({ config: rows[0] ?? null })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  // --- validate ---
  const model = String(body.model ?? "").trim()
  if (!MODEL_RE.test(model) || model.length > MAX_MODEL_LEN) {
    return NextResponse.json(
      { error: "Model must be a Cortex model name using letters, numbers, dot, dash or underscore only." },
      { status: 400 },
    )
  }

  const samplingMode = String(body.sampling_mode ?? "ALL").toUpperCase()
  if (!SAMPLING_MODES.has(samplingMode)) {
    return NextResponse.json({ error: "sampling_mode must be ALL or SAMPLE" }, { status: 400 })
  }

  const resolutionPrompt = String(body.resolution_prompt ?? "")
  if (!resolutionPrompt.trim()) {
    return NextResponse.json({ error: "Resolution prompt is required" }, { status: 400 })
  }
  if (resolutionPrompt.length > MAX_PROMPT_LEN) {
    return NextResponse.json({ error: `Prompt must be under ${MAX_PROMPT_LEN} characters` }, { status: 400 })
  }

  const isEnabled = Boolean(body.is_enabled)
  const sampleRate = Number(body.sample_rate ?? 1)
  if (!(sampleRate >= 0 && sampleRate <= 1)) {
    return NextResponse.json({ error: "sample_rate must be between 0 and 1" }, { status: 400 })
  }
  const maxRows = Number(body.max_rows_per_run ?? 500)
  if (!Number.isInteger(maxRows) || maxRows <= 0 || maxRows > 1_000_000) {
    return NextResponse.json({ error: "max_rows_per_run must be a positive integer" }, { status: 400 })
  }

  const cron = validateCron(body.schedule_cron)
  if (!cron) {
    return NextResponse.json({ error: "schedule_cron must be a valid 5-field cron expression" }, { status: 400 })
  }

  const warnings: string[] = []

  try {
    // 1. Prompt / model / sampling / enabled -> plain UPDATE (bind-parameterized).
    await querySnowflake(
      `UPDATE ${CONFIG}
         SET is_enabled = ?, model = ?, resolution_prompt = ?,
             sampling_mode = ?, sample_rate = ?, max_rows_per_run = ?,
             updated_by = CURRENT_USER(), updated_at = CURRENT_TIMESTAMP()
       WHERE config_id = 'default'`,
      { binds: [isEnabled, model, resolutionPrompt, samplingMode, sampleRate, maxRows] },
    )

    // 2. Schedule -> requires ALTER TASK. Persist the value regardless; the task
    //    may not exist if the automation module isn't installed.
    await querySnowflake(`UPDATE ${CONFIG} SET schedule_cron = ? WHERE config_id = 'default'`, { binds: [cron] })
    try {
      await querySnowflake(`ALTER TASK ${TASK} SUSPEND`)
      await querySnowflake(`ALTER TASK ${TASK} SET SCHEDULE = 'USING CRON ${cron} UTC'`)
      if (isEnabled) {
        await querySnowflake(`ALTER TASK ${TASK} RESUME`)
      }
    } catch (taskErr) {
      const m = taskErr instanceof Error ? taskErr.message : String(taskErr)
      warnings.push(
        `Config saved, but the schedule could not be applied to TASK_LLM_FEEDBACK_SCORING ` +
        `(is the automation module installed?): ${m}`,
      )
    }

    return NextResponse.json({ ok: true, warnings })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
