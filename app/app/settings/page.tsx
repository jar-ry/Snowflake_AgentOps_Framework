import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { S, isPageEnabled } from "@/lib/agentops.config"
import { getModels } from "@/lib/models"
import { PageHeader } from "../components/layout/page-header"
import { ModuleNotEnabled } from "../components/layout/module-not-enabled"
import { DataTableCard } from "../components/cards/data-table-card"
import { LlmConfigForm, type LlmConfig } from "./llm-config-form"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  if (!isPageEnabled("settings")) return <ModuleNotEnabled title="Settings" module="monitoring" />

  let config: LlmConfig | null = null
  let taskExists = true
  let models: string[] = []
  let error: string | null = null

  try {
    models = await getModels()
    const rows = await querySnowflake(
      `SELECT config_id, is_enabled, model, resolution_prompt,
              sampling_mode, sample_rate, max_rows_per_run, schedule_cron, updated_by, updated_at
       FROM ${S}LLM_ASSESSMENT_CONFIG WHERE config_id = 'default'`,
    )
    const r = rows[0]
    config = r
      ? {
          is_enabled: Boolean(r.IS_ENABLED),
          model: String(r.MODEL ?? "llama3.1-8b"),
          resolution_prompt: String(r.RESOLUTION_PROMPT ?? ""),
          sampling_mode: (String(r.SAMPLING_MODE ?? "ALL").toUpperCase() === "SAMPLE" ? "SAMPLE" : "ALL"),
          sample_rate: Number(r.SAMPLE_RATE ?? 1),
          max_rows_per_run: Number(r.MAX_ROWS_PER_RUN ?? 500),
          schedule_cron: String(r.SCHEDULE_CRON ?? "*/30 * * * *"),
          updated_by: r.UPDATED_BY ? String(r.UPDATED_BY) : null,
          updated_at: r.UPDATED_AT ? String(r.UPDATED_AT) : null,
        }
      : null

    // Best-effort: does the scoring task exist? (schedule/enable need it)
    if (S) {
      try {
        const t = await querySnowflake(
          `SHOW TASKS LIKE 'TASK_LLM_FEEDBACK_SCORING' IN SCHEMA ${S.replace(/\.$/, "")}`,
        )
        taskExists = t.length > 0
      } catch {
        taskExists = true // uncertain — let the API surface a warning if it's missing
      }
    }
  } catch (e) {
    error = friendlyError("settings", e)
  }

  return (
    <Box>
      <PageHeader
        title="Settings"
        subtitle="LLM feedback quality assessment — prompt, model, schedule, and sampling"
      />
      {error ? (
        <DataTableCard title="Error" columns={[{ key: "msg", label: "Message" }]} rows={[{ msg: error }]} />
      ) : config ? (
        <LlmConfigForm initial={config} models={models} taskExists={taskExists} />
      ) : (
        <DataTableCard
          title="Not configured"
          columns={[{ key: "msg", label: "Message" }]}
          rows={[{ msg: "LLM_ASSESSMENT_CONFIG not found. Install the monitoring module (setup/install.py --modules monitoring)." }]}
        />
      )}
    </Box>
  )
}
