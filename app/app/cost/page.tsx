import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { toDateStr, pivotByDate } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { BarChartCard, LineChartCard, StackedBarChartCard } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function CostPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())
  const trendConds: string[] = []
  if (agent) trendConds.push(`agent_or_sv_name = '${agent}'`)
  if (envVal) trendConds.push(`environment = '${envVal}'`)
  const agentFilter = trendConds.length ? `WHERE ${trendConds.join(" AND ")}` : ""

  let trends: Record<string, any>[] = []
  let creditsData: Record<string, any>[] = []
  let serviceData: Record<string, any>[] = []
  let latencyData: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_or_sv_name FROM USAGE_METRICS WHERE agent_or_sv_name IS NOT NULL ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.AGENT_OR_SV_NAME).filter(Boolean)

    trends = await querySnowflake(`
      SELECT
        metric_date,
        environment,
        service_type,
        agent_or_sv_name,
        total_requests,
        total_tokens,
        estimated_credits,
        avg_latency_ms,
        p95_latency_ms,
        rolling_7d_credits,
        error_rate_pct
      FROM V_TOKEN_COST_TREND
      ${agentFilter}
      ORDER BY metric_date DESC
      LIMIT 30
    `)

    const dateConds: string[] = [`metric_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
    if (agent) dateConds.push(`agent_or_sv_name = '${agent}'`)
    if (envVal) dateConds.push(`environment = '${envVal}'`)
    const dateFilter = `WHERE ${dateConds.join(" AND ")}`

    creditsData = await querySnowflake(`
      SELECT metric_date, SUM(estimated_credits) AS credits
      FROM V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    latencyData = await querySnowflake(`
      SELECT metric_date, AVG(avg_latency_ms) AS avg_latency, MAX(p95_latency_ms) AS p95_latency
      FROM V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    serviceData = await querySnowflake(`
      SELECT metric_date, service_type, SUM(estimated_credits) AS credits
      FROM V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date, service_type
      ORDER BY metric_date ASC
    `)
  } catch (e) {
    error = friendlyError("cost", e)
  }

  // Daily credits + statistical anomaly threshold (mean + 2.5 stddev).
  const credits = creditsData.map((r) => ({ DATE: toDateStr(r.METRIC_DATE), CREDITS: Number(r.CREDITS) }))
  const creditVals = credits.map((r) => r.CREDITS).filter((v) => Number.isFinite(v))
  const mean = creditVals.length ? creditVals.reduce((a, b) => a + b, 0) / creditVals.length : 0
  const variance = creditVals.length ? creditVals.reduce((a, b) => a + (b - mean) ** 2, 0) / creditVals.length : 0
  const sd = Math.sqrt(variance)
  const anomalyThreshold = creditVals.length ? mean + 2.5 * sd : undefined
  const anomalyIndices = anomalyThreshold !== undefined ? credits.map((r, i) => (r.CREDITS > anomalyThreshold ? i : -1)).filter((i) => i >= 0) : []

  const creditCategories = credits.map((r) => r.DATE)
  const creditValues = credits.map((r) => r.CREDITS)

  // Latency.
  const latency = latencyData.map((r) => ({
    DATE: toDateStr(r.METRIC_DATE),
    AVG_LATENCY: Number(r.AVG_LATENCY),
    P95_LATENCY: Number(r.P95_LATENCY),
  }))
  const latencyCategories = latency.map((r) => r.DATE)

  // Credits by service composition.
  const { data: serviceCredits, seriesNames: serviceNames } = pivotByDate(serviceData, "METRIC_DATE", "SERVICE_TYPE", "CREDITS")
  const serviceCategories = serviceCredits.map((r) => r.DATE)
  const serviceSeries = serviceNames.map((name) => ({ name, data: serviceCredits.map((r) => Number(r[name] ?? 0)) }))

  const trendRows = trends.map((r) => ({
    metric_date: r.METRIC_DATE,
    service_type: r.SERVICE_TYPE,
    target: r.AGENT_OR_SV_NAME,
    requests: Number(r.TOTAL_REQUESTS),
    tokens: `${(r.TOTAL_TOKENS / 1000).toFixed(1)}k`,
    credits: Number(Number(r.ESTIMATED_CREDITS).toFixed(4)),
    avg_latency: `${Math.round(r.AVG_LATENCY_MS)}ms`,
    p95: `${Math.round(r.P95_LATENCY_MS)}ms`,
    error_pct: `${r.ERROR_RATE_PCT}%`,
  }))

  return (
    <Box>
      <PageHeader
        title="Token Cost & Usage"
        subtitle="Daily token consumption and estimated AI Credit costs"
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
          {credits.length > 0 ? (
            <Grid size={{ xs: 12 }}>
              <BarChartCard
                title="Daily AI Credits"
                subheader="Red bars are statistical outliers (above mean + 2.5 standard deviations) — likely cost anomalies."
                categories={creditCategories}
                data={creditValues}
                seriesName="Credits"
                format={{ decimals: 2 }}
                anomalyIndices={anomalyIndices}
                baseline={mean > 0 ? { value: mean, label: `Avg ${mean.toFixed(2)}` } : undefined}
              />
            </Grid>
          ) : null}

          {serviceSeries.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <StackedBarChartCard
                title="Credits by Service"
                subheader="cortex_agent (orchestration) vs cortex_analyst (semantic-view SQL)"
                categories={serviceCategories}
                series={serviceSeries}
                format={{ decimals: 2 }}
              />
            </Grid>
          ) : null}

          {latency.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <LineChartCard
                title="Latency Over Time"
                subheader="Average and P95 request latency (ms)"
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
              title="Usage Detail"
              subheader="Per-day, per-target usage (latest 30 rows)"
              pageSize={10}
              defaultSortKey="metric_date"
              defaultSortDir="desc"
              columns={[
                { key: "metric_date", label: "Date", headerInfo: "The day these usage metrics were aggregated." },
                { key: "service_type", label: "Service", headerInfo: "cortex_agent (orchestration) or cortex_analyst (semantic-view SQL)." },
                { key: "target", label: "Target", headerInfo: "The agent or semantic view that generated this usage." },
                { key: "requests", label: "Requests", type: "number", headerInfo: "Number of requests handled that day." },
                { key: "tokens", label: "Tokens", type: "number", headerInfo: "Total tokens consumed (input + output) that day." },
                { key: "credits", label: "Credits", type: "number", headerInfo: "Estimated AI credits consumed that day." },
                { key: "avg_latency", label: "Avg Latency", type: "number", headerInfo: "Average request latency in milliseconds." },
                { key: "p95", label: "P95", type: "number", headerInfo: "95th-percentile latency." },
                { key: "error_pct", label: "Error %", type: "number", headerInfo: "Percent of requests that failed that day." },
              ]}
              rows={trendRows}
              emptyMessage="No usage data yet. The daily aggregation task populates this."
            />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
