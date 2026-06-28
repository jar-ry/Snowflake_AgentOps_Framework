import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { pivotByDate, toDateStr } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { LineChartCard, StackedBarChartCard, type LineSeries } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { FlaggedInteractionsTable, type FlaggedRow } from "../components/flagged-interactions-table"
import { SeverityLegend } from "../components/severity-legend"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function QualityPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())
  const qConds: string[] = []
  if (agent) qConds.push(`agent_name = '${agent}'`)
  if (envVal) qConds.push(`environment = '${envVal}'`)
  const agentFilter = qConds.length ? `WHERE ${qConds.join(" AND ")}` : ""
  const flagsAgentFilter = agentFilter

  let flags: Record<string, any>[] = []
  let daily: Record<string, any>[] = []
  let flaggedTrend: Record<string, any>[] = []
  let flagBreakdown: Record<string, any>[] = []
  let latencyData: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_name FROM V_INTERACTION_QUALITY_FLAGS WHERE agent_name IS NOT NULL ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.AGENT_NAME).filter(Boolean)

    flags = await querySnowflake(`
      SELECT
        signal_source,
        interaction_id,
        environment,
        agent_name,
        user_query,
        severity,
        flag_tool_looping,
        flag_excessive_steps,
        flag_slow_request,
        flag_high_token_burn,
        flag_planning_error,
        total_duration_ms,
        total_tokens
      FROM V_INTERACTION_QUALITY_FLAGS
      ${flagsAgentFilter}
      ORDER BY event_time DESC
      LIMIT 20
    `)

    daily = await querySnowflake(`
      SELECT
        summary_date,
        agent_name,
        total_requests,
        flagged_requests,
        flagged_request_pct,
        critical_count,
        warning_count
      FROM V_INTERACTION_QUALITY_DASHBOARD
      ${agentFilter}
      ORDER BY summary_date DESC
      LIMIT 14
    `)

    flaggedTrend = await querySnowflake(`
      SELECT summary_date, agent_name, flagged_request_pct
      FROM V_INTERACTION_QUALITY_DASHBOARD
      ${agentFilter}
      ${agentFilter ? "AND" : "WHERE"} summary_date >= DATEADD('day', -${win.days}, CURRENT_DATE())
      ORDER BY summary_date ASC
    `)

    flagBreakdown = await querySnowflake(`
      SELECT
        summary_date,
        SUM(tool_looping_count)    AS looping,
        SUM(high_token_burn_count) AS burn,
        SUM(slow_request_count)    AS slow,
        SUM(excessive_steps_count) AS steps,
        SUM(planning_error_count)  AS planning
      FROM INTERACTION_QUALITY_DAILY
      ${agentFilter}
      ${agentFilter ? "AND" : "WHERE"} summary_date >= DATEADD('day', -${win.days}, CURRENT_DATE())
      GROUP BY summary_date
      ORDER BY summary_date ASC
    `)

    const latConds: string[] = [`metric_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
    if (agent) latConds.push(`agent_or_sv_name = '${agent}'`)
    if (envVal) latConds.push(`environment = '${envVal}'`)
    const latFilter = `WHERE ${latConds.join(" AND ")}`
    latencyData = await querySnowflake(`
      SELECT metric_date, AVG(avg_latency_ms) AS avg_latency, MAX(p95_latency_ms) AS p95_latency
      FROM V_TOKEN_COST_TREND
      ${latFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)
  } catch (e) {
    error = friendlyError("quality", e)
  }

  const { data: flaggedData, seriesNames } = pivotByDate(flaggedTrend, "SUMMARY_DATE", "AGENT_NAME", "FLAGGED_REQUEST_PCT")
  const flaggedCategories = flaggedData.map((r) => r.DATE)
  const flaggedSeries: LineSeries[] = seriesNames.map((name) => ({ name, data: flaggedData.map((r) => (r[name] == null ? null : Number(r[name]))) }))

  const latency = latencyData.map((r) => ({
    DATE: toDateStr(r.METRIC_DATE),
    AVG_LATENCY: Number(r.AVG_LATENCY),
    P95_LATENCY: Number(r.P95_LATENCY),
  }))
  const latencyCategories = latency.map((r) => r.DATE)

  const breakdown = flagBreakdown.map((r) => ({
    DATE: toDateStr(r.SUMMARY_DATE),
    LOOPING: Number(r.LOOPING),
    BURN: Number(r.BURN),
    SLOW: Number(r.SLOW),
    STEPS: Number(r.STEPS),
    PLANNING: Number(r.PLANNING),
  }))
  const breakdownCategories = breakdown.map((r) => r.DATE)
  const breakdownSeries = [
    { name: "Tool looping", data: breakdown.map((r) => r.LOOPING) },
    { name: "High token burn", data: breakdown.map((r) => r.BURN) },
    { name: "Slow request", data: breakdown.map((r) => r.SLOW) },
    { name: "Excessive steps", data: breakdown.map((r) => r.STEPS) },
    { name: "Planning error", data: breakdown.map((r) => r.PLANNING) },
  ]

  const dailyRows = daily.map((r) => ({
    summary_date: r.SUMMARY_DATE,
    agent_name: r.AGENT_NAME,
    total_requests: Number(r.TOTAL_REQUESTS),
    flagged_requests: Number(r.FLAGGED_REQUESTS),
    flagged_pct: `${r.FLAGGED_REQUEST_PCT}%`,
    critical_count: Number(r.CRITICAL_COUNT),
    warning_count: Number(r.WARNING_COUNT),
  }))

  const flaggedRows: FlaggedRow[] = flags.map((r) => {
    const f: { key: string; label: string }[] = []
    if (r.FLAG_TOOL_LOOPING) f.push({ key: "flag_tool_looping", label: "Loop" })
    if (r.FLAG_EXCESSIVE_STEPS) f.push({ key: "flag_excessive_steps", label: "Steps" })
    if (r.FLAG_SLOW_REQUEST) f.push({ key: "flag_slow_request", label: "Slow" })
    if (r.FLAG_HIGH_TOKEN_BURN) f.push({ key: "flag_high_token_burn", label: "Burn" })
    if (r.FLAG_PLANNING_ERROR) f.push({ key: "flag_planning_error", label: "Error" })
    return {
      severity: r.SEVERITY,
      agent: r.AGENT_NAME,
      query: r.USER_QUERY,
      duration: `${Math.round(r.TOTAL_DURATION_MS / 1000)}s`,
      tokens: `${(r.TOTAL_TOKENS / 1000).toFixed(1)}k`,
      flags: f,
    }
  })

  return (
    <Box>
      <PageHeader
        title="Interaction Quality"
        subtitle="Rules-based detection of problematic agent interactions (no LLM needed)"
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
          {flaggedData.length > 0 ? (
            <Grid size={{ xs: 12 }}>
              <LineChartCard
                title="Flagged % Over Time"
                subheader="Share of requests flagged per day. Above the 20% line triggers an interaction-quality alert."
                categories={flaggedCategories}
                series={flaggedSeries}
                threshold={{ value: 20, label: "Alert threshold 20%" }}
                format={{ suffix: "%" }}
              />
            </Grid>
          ) : null}

          {breakdown.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <StackedBarChartCard
                title="What's Driving the Flags"
                subheader="Daily count of each signal. Tool looping + high token burn together escalate to CRITICAL."
                categories={breakdownCategories}
                series={breakdownSeries}
                format={{ decimals: 0 }}
              />
            </Grid>
          ) : null}

          {latency.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <LineChartCard
                title="Request Latency Over Time"
                subheader="Average and P95 latency (ms). Sustained P95 spikes often correlate with looping/slow-request flags."
                categories={latencyCategories}
                series={[
                  { name: "Avg latency", data: latency.map((r) => r.AVG_LATENCY) },
                  { name: "P95 latency", data: latency.map((r) => r.P95_LATENCY) },
                ]}
                format={{ suffix: "ms" }}
              />
            </Grid>
          ) : null}

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Daily Summary"
              subheader="Last 14 days"
              pageSize={7}
              defaultSortKey="summary_date"
              defaultSortDir="desc"
              columns={[
                { key: "summary_date", label: "Date", headerInfo: "The day these interaction-quality metrics were aggregated." },
                { key: "agent_name", label: "Agent", headerInfo: "The agent whose interactions were analyzed." },
                { key: "total_requests", label: "Requests", type: "number", headerInfo: "Total agent requests that day." },
                { key: "flagged_requests", label: "Flagged", type: "number", headerInfo: "Requests that triggered one or more quality signals." },
                { key: "flagged_pct", label: "Flagged %", type: "number", headerInfo: "Share of requests flagged. Above 20% triggers an alert." },
                { key: "critical_count", label: "Critical", type: "number", headerInfo: "Flagged requests rated CRITICAL: a planning error, or tool-looping combined with high token burn." },
                { key: "warning_count", label: "Warning", type: "number", headerInfo: "Flagged requests rated WARNING: a single quality signal." },
              ]}
              rows={dailyRows}
              emptyMessage="No quality data yet."
            />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <SeverityLegend />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <FlaggedInteractionsTable title="Recent Flagged Interactions" subheader="Click a flag badge for remediation steps" rows={flaggedRows} pageSize={10} />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
