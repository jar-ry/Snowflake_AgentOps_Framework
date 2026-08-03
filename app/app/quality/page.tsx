import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { pivotByDate, toDateStr } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { S, isPageEnabled } from "@/lib/agentops.config"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { ModuleNotEnabled } from "../components/layout/module-not-enabled"
import { KpiCard } from "../components/cards/kpi-card"
import { LineChartCard, StackedBarChartCard, type LineSeries } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { FlaggedInteractionsTable, type FlaggedRow } from "../components/flagged-interactions-table"
import { SeverityLegend } from "../components/severity-legend"
import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr/CheckCircle"
import { SmileyIcon } from "@phosphor-icons/react/dist/ssr/Smiley"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function QualityPage({ searchParams }: Props) {
  if (!isPageEnabled("quality")) return <ModuleNotEnabled title="Quality" module="monitoring" />
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
  let llmKpis: Record<string, any> | null = null
  let llmTrend: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_name FROM ${S}V_INTERACTION_QUALITY_FLAGS WHERE agent_name IS NOT NULL ORDER BY 1
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
      FROM ${S}V_INTERACTION_QUALITY_FLAGS
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
      FROM ${S}V_INTERACTION_QUALITY_DASHBOARD
      ${agentFilter}
      ORDER BY summary_date DESC
      LIMIT 14
    `)

    flaggedTrend = await querySnowflake(`
      SELECT summary_date, agent_name, flagged_request_pct
      FROM ${S}V_INTERACTION_QUALITY_DASHBOARD
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
      FROM ${S}INTERACTION_QUALITY_DAILY
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
      FROM ${S}V_TOKEN_COST_TREND
      ${latFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    // AI Sentiment (LLM-judged quality)
    const sentTrendConds: string[] = [`summary_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
    if (agent) sentTrendConds.push(`agent_or_sv_name = '${agent}'`)
    if (envVal) sentTrendConds.push(`environment = '${envVal}'`)
    const sentWhere = `WHERE ${sentTrendConds.join(" AND ")}`

    llmKpis = await querySnowflake(`
      SELECT
        ROUND(SUM(COALESCE(llm_resolved_count, 0)) * 100.0 / NULLIF(SUM(COALESCE(llm_total_scored, 0)), 0), 1) AS resolution_rate,
        ROUND(SUM(COALESCE(llm_positive_count, 0)) * 100.0 / NULLIF(SUM(COALESCE(llm_total_scored, 0)), 0), 1) AS positive_experience_rate,
        COALESCE(SUM(llm_total_scored), 0) AS total_scored
      FROM ${S}FEEDBACK_DAILY_SUMMARY
      ${sentWhere}
    `).then(r => r[0] ?? null)

    llmTrend = await querySnowflake(`
      SELECT
        summary_date,
        ROUND(SUM(COALESCE(llm_resolved_count, 0)) * 100.0 / NULLIF(SUM(COALESCE(llm_total_scored, 0)), 0), 1) AS resolution_rate,
        ROUND(SUM(COALESCE(llm_positive_count, 0)) * 100.0 / NULLIF(SUM(COALESCE(llm_total_scored, 0)), 0), 1) AS positive_experience
      FROM ${S}FEEDBACK_DAILY_SUMMARY
      ${sentWhere}
      GROUP BY summary_date
      ORDER BY summary_date ASC
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
        subtitle="Rules-based flags + AI-judged resolution and sentiment"
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
          {/* Top KPIs — mixed signals at a glance */}
          {(daily.length > 0 || llmKpis) ? (
            <>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard
                  label="Flagged %"
                  value={daily.length > 0 ? `${daily[0].FLAGGED_REQUEST_PCT}%` : "—"}
                  accent="var(--mui-palette-warning-main)"
                  valueColor={Number(daily[0]?.FLAGGED_REQUEST_PCT) >= 20 ? "var(--mui-palette-error-main)" : undefined}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Resolution Rate" value={`${llmKpis?.RESOLUTION_RATE ?? "—"}%`} accent="var(--mui-palette-success-main)" icon={<CheckCircleIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Positive Experience" value={`${llmKpis?.POSITIVE_EXPERIENCE_RATE ?? "—"}%`} accent="var(--mui-palette-primary-main)" icon={<SmileyIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Total Requests" value={daily.length > 0 ? Number(daily[0].TOTAL_REQUESTS).toLocaleString() : "—"} accent="var(--mui-palette-info-main)" />
              </Grid>
            </>
          ) : null}

          {/* Side-by-side trend charts: Rules flags (left) + AI quality (right) */}
          {flaggedData.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <LineChartCard
                title="Flagged % (Rules-Based)"
                subheader="Above 20% triggers an alert"
                categories={flaggedCategories}
                series={flaggedSeries}
                threshold={{ value: 20, label: "Alert threshold 20%" }}
                format={{ suffix: "%" }}
              />
            </Grid>
          ) : null}

          {llmTrend.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <LineChartCard
                title="AI Quality Scores (LLM-Judged)"
                subheader="Was the query resolved? Was the experience positive?"
                categories={llmTrend.map((r) => toDateStr(r.SUMMARY_DATE))}
                series={[
                  { name: "Query Resolved %", data: llmTrend.map((r) => r.RESOLUTION_RATE == null ? null : Number(r.RESOLUTION_RATE)) },
                  { name: "Positive Experience %", data: llmTrend.map((r) => r.POSITIVE_EXPERIENCE == null ? null : Number(r.POSITIVE_EXPERIENCE)) },
                ]}
                format={{ suffix: "%" }}
                yMin={0}
                yMax={100}
              />
            </Grid>
          ) : null}

          {/* Flag breakdown + latency side-by-side */}
          {breakdown.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <StackedBarChartCard
                title="What's Driving the Flags"
                subheader="Tool looping + high token burn together = CRITICAL"
                categories={breakdownCategories}
                series={breakdownSeries}
                format={{ decimals: 0 }}
              />
            </Grid>
          ) : null}

          {latency.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <LineChartCard
                title="Request Latency"
                subheader="Average and P95 (ms)"
                categories={latencyCategories}
                series={[
                  { name: "Avg latency", data: latency.map((r) => r.AVG_LATENCY) },
                  { name: "P95 latency", data: latency.map((r) => r.P95_LATENCY) },
                ]}
                format={{ suffix: "ms" }}
              />
            </Grid>
          ) : null}

          {/* Daily summary table */}
          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Daily Summary"
              subheader="Last 14 days"
              pageSize={7}
              defaultSortKey="summary_date"
              defaultSortDir="desc"
              columns={[
                { key: "summary_date", label: "Date" },
                { key: "agent_name", label: "Agent" },
                { key: "total_requests", label: "Requests", type: "number" },
                { key: "flagged_requests", label: "Flagged", type: "number" },
                { key: "flagged_pct", label: "Flagged %", type: "number" },
                { key: "critical_count", label: "Critical", type: "number" },
                { key: "warning_count", label: "Warning", type: "number" },
              ]}
              rows={dailyRows}
              emptyMessage="No quality data yet."
            />
          </Grid>

          {/* Flagged interactions detail */}
          <Grid size={{ xs: 12 }}>
            <FlaggedInteractionsTable title="Recent Flagged Interactions" rows={flaggedRows} pageSize={10} />
          </Grid>

          <Grid size={{ xs: 12 }}>
            <SeverityLegend />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
