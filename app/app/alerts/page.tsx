import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { toDateStr } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { KpiCard } from "../components/cards/kpi-card"
import { BarChartCard } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { WarningOctagonIcon } from "@phosphor-icons/react/dist/ssr/WarningOctagon"
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning"
import { BellIcon } from "@phosphor-icons/react/dist/ssr/Bell"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function AlertsPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())
  const activeConds: string[] = []
  if (agent) activeConds.push(`target_name = '${agent}'`)
  if (envVal) activeConds.push(`environment = '${envVal}'`)
  const agentFilter = activeConds.length ? `WHERE ${activeConds.join(" AND ")}` : ""
  const agentFilterAnd = `${agent ? `AND target_name = '${agent}'` : ""} ${envVal ? `AND environment = '${envVal}'` : ""}`

  let active: Record<string, any>[] = []
  let recent: Record<string, any>[] = []
  let history: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT target_name FROM ALERT_HISTORY WHERE target_name IS NOT NULL ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.TARGET_NAME).filter(Boolean)

    active = await querySnowflake(`
      SELECT
        alert_id, alert_type, severity, environment,
        target_name, message, metric_value, threshold_value,
        created_at, hours_since_created
      FROM V_ACTIVE_ALERTS
      ${agentFilter}
      LIMIT 50
    `)

    recent = await querySnowflake(`
      SELECT
        alert_type, severity, environment, target_name,
        message, created_at, acknowledged
      FROM ALERT_HISTORY
      WHERE 1=1 ${agentFilterAnd}
      ORDER BY created_at DESC
      LIMIT 20
    `)

    history = await querySnowflake(`
      SELECT TO_DATE(created_at) AS alert_date, COUNT(*) AS alert_count
      FROM ALERT_HISTORY
      WHERE created_at >= DATEADD('day', -${win.days}, CURRENT_DATE()) ${agentFilterAnd}
      GROUP BY TO_DATE(created_at)
      ORDER BY alert_date ASC
    `)
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error"
  }

  const historyData = history.map((r) => ({ DATE: toDateStr(r.ALERT_DATE), COUNT: Number(r.ALERT_COUNT) }))
  const critCount = active.filter((a) => (a.SEVERITY || "").toUpperCase() === "CRITICAL").length
  const warnCount = active.filter((a) => (a.SEVERITY || "").toUpperCase() === "WARNING").length

  const activeRows = active.map((a) => ({
    severity: a.SEVERITY,
    alert_type: a.ALERT_TYPE,
    target_name: a.TARGET_NAME,
    message: a.MESSAGE,
    hours_ago: `${a.HOURS_SINCE_CREATED}h`,
  }))

  const recentRows = recent.map((a) => ({
    severity: a.SEVERITY,
    alert_type: a.ALERT_TYPE,
    target_name: a.TARGET_NAME,
    message: a.MESSAGE,
    created_at: a.CREATED_AT,
    ack: a.ACKNOWLEDGED ? "Yes" : "No",
  }))

  return (
    <Box>
      <PageHeader
        title="Alerts"
        subtitle="Unacknowledged alerts ordered by severity, plus history"
        actions={
          <>
            <AgentFilter agents={agents} />
            <TimeWindow />
          </>
        }
      />

      {error ? (
        <DataTableCard title="Error" columns={[{ key: "msg", label: "Message" }]} rows={[{ msg: error }]} />
      ) : (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <KpiCard label="Critical" value={String(critCount)} accent="var(--mui-palette-error-main)" valueColor="var(--mui-palette-error-main)" icon={<WarningOctagonIcon fontSize="var(--icon-fontSize-lg)" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <KpiCard label="Warning" value={String(warnCount)} accent="var(--mui-palette-warning-main)" valueColor="var(--mui-palette-warning-main)" icon={<WarningIcon fontSize="var(--icon-fontSize-lg)" />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <KpiCard label="Total Active" value={String(active.length)} accent="var(--mui-palette-primary-main)" icon={<BellIcon fontSize="var(--icon-fontSize-lg)" />} />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Active Alerts"
              subheader={active.length === 0 ? "All clear — no active alerts." : "Unacknowledged alerts. Open Resolve for step-by-step guidance."}
              pageSize={10}
              defaultSortKey="severity"
              defaultSortDir="asc"
              columns={[
                { key: "severity", label: "Severity", type: "severity", headerInfo: "CRITICAL needs immediate action; WARNING needs attention." },
                { key: "alert_type", label: "Type", headerInfo: "Which monitoring rule fired (e.g. cost_anomaly, accuracy_regression, latency_degradation)." },
                { key: "target_name", label: "Target", headerInfo: "The agent or semantic view the alert is about." },
                { key: "message", label: "Message", headerInfo: "Details of what breached, including the metric value and threshold." },
                { key: "hours_ago", label: "Age", headerInfo: "How long ago the alert fired (unacknowledged)." },
                { key: "resolve", label: "Resolve", type: "guidance-alert", guidanceField: "alert_type" },
              ]}
              rows={activeRows}
              emptyMessage="No active alerts — all clear."
            />
          </Grid>

          {historyData.length > 0 ? (
            <Grid size={{ xs: 12 }}>
              <BarChartCard
                title="Alerts Fired Per Day"
                subheader="Daily count of alerts raised over the selected window"
                categories={historyData.map((r) => r.DATE)}
                data={historyData.map((r) => r.COUNT)}
                seriesName="Alerts"
                format={{ decimals: 0 }}
              />
            </Grid>
          ) : null}

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Alert History"
              subheader="Most recent 20 alerts"
              pageSize={10}
              defaultSortKey="created_at"
              defaultSortDir="desc"
              columns={[
                { key: "severity", label: "Severity", type: "severity", headerInfo: "CRITICAL needs immediate action; WARNING needs attention." },
                { key: "alert_type", label: "Type", headerInfo: "Which monitoring rule fired." },
                { key: "target_name", label: "Target", headerInfo: "The agent or semantic view the alert is about." },
                { key: "message", label: "Message", headerInfo: "Details of what breached." },
                { key: "created_at", label: "Created", headerInfo: "When the alert was raised." },
                { key: "ack", label: "Ack", headerInfo: "Whether an operator has acknowledged this alert." },
                { key: "resolve", label: "Resolve", type: "guidance-alert", guidanceField: "alert_type" },
              ]}
              rows={recentRows}
              emptyMessage="No alert history."
            />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
