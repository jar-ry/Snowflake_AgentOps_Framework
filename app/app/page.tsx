import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "./components/agent-filter"
import { TimeWindow } from "./components/time-window"
import { PageHeader } from "./components/layout/page-header"
import { KpiCard } from "./components/cards/kpi-card"
import { DataTableCard } from "./components/cards/data-table-card"
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp"
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle"
import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/ssr/CurrencyDollar"
import { TimerIcon } from "@phosphor-icons/react/dist/ssr/Timer"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function Overview({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())
  const envAnd = envVal ? `AND environment = '${envVal}'` : ""
  const agentFilter = agent ? `AND agent_or_sv_name = '${agent}'` : ""
  const alertAgentFilter = agent ? `AND target_name = '${agent}'` : ""

  let metrics: Record<string, any> | null = null
  let prevMetrics: Record<string, any> | null = null
  let recentAlerts: Record<string, any>[] = []
  let series: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_or_sv_name FROM USAGE_METRICS ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.AGENT_OR_SV_NAME).filter(Boolean)

    const kpiRows = await querySnowflake(`
      SELECT
        COALESCE(SUM(total_requests), 0) AS total_requests_7d,
        COALESCE(SUM(successful_requests), 0) AS successful_7d,
        COALESCE(SUM(failed_requests), 0) AS failed_7d,
        ROUND(COALESCE(SUM(estimated_credits), 0), 4) AS credits_7d,
        ROUND(COALESCE(AVG(avg_latency_ms), 0), 0) AS avg_latency_ms
      FROM USAGE_METRICS
      WHERE metric_date >= DATEADD('day', -${win.days}, CURRENT_DATE())
      ${agentFilter} ${envAnd}
    `)
    metrics = kpiRows[0] ?? null

    const prevRows = await querySnowflake(`
      SELECT
        COALESCE(SUM(total_requests), 0) AS total_requests_7d,
        COALESCE(SUM(successful_requests), 0) AS successful_7d,
        ROUND(COALESCE(SUM(estimated_credits), 0), 4) AS credits_7d,
        ROUND(COALESCE(AVG(avg_latency_ms), 0), 0) AS avg_latency_ms
      FROM USAGE_METRICS
      WHERE metric_date >= DATEADD('day', -${win.days * 2}, CURRENT_DATE())
        AND metric_date <  DATEADD('day', -${win.days}, CURRENT_DATE())
      ${agentFilter} ${envAnd}
    `)
    prevMetrics = prevRows[0] ?? null

    series = await querySnowflake(`
      SELECT
        metric_date,
        SUM(total_requests) AS requests,
        CASE WHEN SUM(total_requests) > 0 THEN SUM(successful_requests) * 100.0 / SUM(total_requests) ELSE 0 END AS success_rate,
        SUM(estimated_credits) AS credits,
        AVG(avg_latency_ms) AS latency
      FROM USAGE_METRICS
      WHERE metric_date >= DATEADD('day', -${win.days}, CURRENT_DATE())
      ${agentFilter} ${envAnd}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    recentAlerts = await querySnowflake(`
      SELECT alert_type, severity, target_name, message,
             DATEDIFF('hour', created_at, CURRENT_TIMESTAMP()) AS hours_ago
      FROM ALERT_HISTORY
      WHERE acknowledged = FALSE
      ${alertAgentFilter} ${envAnd}
      ORDER BY created_at DESC
      LIMIT 5
    `)
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error"
  }

  const requestsSeries = series.map((r) => Number(r.REQUESTS))
  const successSeries = series.map((r) => Number(r.SUCCESS_RATE))
  const creditsSeries = series.map((r) => Number(r.CREDITS))
  const latencySeries = series.map((r) => Number(r.LATENCY))

  const hasPrev = !!prevMetrics && Number(prevMetrics.TOTAL_REQUESTS_7D) > 0
  const curSuccessPct =
    metrics && metrics.TOTAL_REQUESTS_7D > 0 ? (metrics.SUCCESSFUL_7D / metrics.TOTAL_REQUESTS_7D) * 100 : 0
  const prevSuccessPct =
    prevMetrics && prevMetrics.TOTAL_REQUESTS_7D > 0
      ? (prevMetrics.SUCCESSFUL_7D / prevMetrics.TOTAL_REQUESTS_7D) * 100
      : 0

  const alertRows = recentAlerts.map((a) => ({
    severity: a.SEVERITY,
    alert_type: a.ALERT_TYPE,
    target_name: a.TARGET_NAME,
    message: a.MESSAGE,
    hours_ago: `${a.HOURS_AGO}h`,
  }))

  return (
    <Box>
      <PageHeader
        title={`${win.days}-Day Overview`}
        subtitle="Agent & semantic view health at a glance"
        actions={
          <>
            <AgentFilter agents={agents} />
            <TimeWindow />
          </>
        }
      />

      {error ? (
        <DataTableCard title="Error" columns={[{ key: "msg", label: "Message" }]} rows={[{ msg: error }]} />
      ) : metrics ? (
        <Grid container spacing={3} sx={{ mb: 1 }}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiCard
              label="Requests"
              value={Number(metrics.TOTAL_REQUESTS_7D).toLocaleString()}
              icon={<ChartLineUpIcon fontSize="var(--icon-fontSize-lg)" />}
              accent="var(--mui-palette-primary-main)"
              delta={hasPrev ? { value: Number(metrics.TOTAL_REQUESTS_7D) - Number(prevMetrics?.TOTAL_REQUESTS_7D ?? 0) } : undefined}
              spark={requestsSeries}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiCard
              label="Success Rate"
              value={`${metrics.TOTAL_REQUESTS_7D > 0 ? Math.round((metrics.SUCCESSFUL_7D / metrics.TOTAL_REQUESTS_7D) * 100) : 0}%`}
              icon={<CheckCircleIcon fontSize="var(--icon-fontSize-lg)" />}
              accent="var(--mui-palette-success-main)"
              delta={hasPrev ? { value: curSuccessPct - prevSuccessPct, suffix: "pp", decimals: 1 } : undefined}
              spark={successSeries}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiCard
              label="AI Credits"
              value={Number(metrics.CREDITS_7D).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              icon={<CurrencyDollarIcon fontSize="var(--icon-fontSize-lg)" />}
              accent="var(--mui-palette-info-main)"
              delta={hasPrev ? { value: Number(metrics.CREDITS_7D) - Number(prevMetrics?.CREDITS_7D ?? 0), decimals: 2, goodWhenUp: false } : undefined}
              spark={creditsSeries}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <KpiCard
              label="Avg Latency"
              value={`${metrics.AVG_LATENCY_MS}ms`}
              icon={<TimerIcon fontSize="var(--icon-fontSize-lg)" />}
              accent="var(--mui-palette-warning-main)"
              delta={hasPrev ? { value: Number(metrics.AVG_LATENCY_MS) - Number(prevMetrics?.AVG_LATENCY_MS ?? 0), suffix: "ms", goodWhenUp: false } : undefined}
              spark={latencySeries}
            />
          </Grid>
        </Grid>
      ) : null}

      <Box sx={{ mt: 3 }}>
        <DataTableCard
          title="Active Alerts"
          subheader="Unacknowledged alerts across monitored targets"
          columns={[
            { key: "severity", label: "Severity", type: "severity", headerInfo: "CRITICAL needs immediate action; WARNING needs attention. Driven by the alert type's threshold rules." },
            { key: "alert_type", label: "Type", headerInfo: "Which monitoring rule fired (e.g. cost_anomaly, accuracy_regression, interaction_quality)." },
            { key: "target_name", label: "Target", headerInfo: "The agent or semantic view the alert is about." },
            { key: "message", label: "Message", headerInfo: "Details of what breached, including the metric value and threshold." },
            { key: "hours_ago", label: "Age", headerInfo: "How long ago the alert fired." },
            { key: "resolve", label: "Resolve", type: "guidance-alert", guidanceField: "alert_type" },
          ]}
          rows={alertRows}
          emptyMessage="No active alerts."
        />
      </Box>
    </Box>
  )
}
