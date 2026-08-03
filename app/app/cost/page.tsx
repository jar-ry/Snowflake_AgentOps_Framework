import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { toDateStr, pivotByDate } from "@/lib/chart-data"
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
import { BarChartCard, LineChartCard, StackedBarChartCard } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { WalletIcon } from "@phosphor-icons/react/dist/ssr/Wallet"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function CostPage({ searchParams }: Props) {
  if (!isPageEnabled("cost")) return <ModuleNotEnabled title="Cost" module="monitoring" />
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
  let userData: Record<string, any>[] = []
  let modelData: Record<string, any>[] = []
  let budgets: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_or_sv_name FROM ${S}USAGE_METRICS WHERE agent_or_sv_name IS NOT NULL ORDER BY 1
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
      FROM ${S}V_TOKEN_COST_TREND
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
      FROM ${S}V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    latencyData = await querySnowflake(`
      SELECT metric_date, AVG(avg_latency_ms) AS avg_latency, MAX(p95_latency_ms) AS p95_latency
      FROM ${S}V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date
      ORDER BY metric_date ASC
    `)

    serviceData = await querySnowflake(`
      SELECT metric_date, service_type, SUM(estimated_credits) AS credits
      FROM ${S}V_TOKEN_COST_TREND
      ${dateFilter}
      GROUP BY metric_date, service_type
      ORDER BY metric_date ASC
    `)

    // Per-user attribution (chargeback)
    const userConds: string[] = [`metric_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
    if (agent) userConds.push(`agent_or_sv_name = '${agent}'`)
    if (envVal) userConds.push(`environment = '${envVal}'`)
    const userFilter = `WHERE ${userConds.join(" AND ")}`
    userData = await querySnowflake(`
      SELECT user_name, SUM(estimated_credits) AS credits, SUM(total_requests) AS requests, SUM(total_tokens) AS tokens
      FROM ${S}USAGE_METRICS_BY_USER
      ${userFilter}
      GROUP BY user_name
      ORDER BY credits DESC NULLS LAST
      LIMIT 20
    `)

    // Per-model breakdown
    modelData = await querySnowflake(`
      SELECT model_name, SUM(estimated_credits) AS credits, SUM(total_requests) AS requests,
             SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
      FROM ${S}USAGE_METRICS_BY_MODEL
      ${userFilter}
      GROUP BY model_name
      ORDER BY credits DESC NULLS LAST
    `)

    // Budget burn
    budgets = await querySnowflake(`
      SELECT budget_name, budget_period, budget_credits, spent_credits, pct_used, remaining_credits, over_threshold
      FROM ${S}V_BUDGET_BURN
      ORDER BY pct_used DESC NULLS LAST
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

  // Per-user attribution.
  const userRows = userData.map((r) => ({
    user_name: r.USER_NAME,
    credits: Number(Number(r.CREDITS ?? 0).toFixed(4)),
    requests: Number(r.REQUESTS ?? 0),
    tokens: `${(Number(r.TOKENS ?? 0) / 1000).toFixed(1)}k`,
  }))

  // Per-model breakdown.
  const modelCategories = modelData.map((r) => String(r.MODEL_NAME))
  const modelCredits = modelData.map((r) => Number(Number(r.CREDITS ?? 0).toFixed(4)))
  const modelRows = modelData.map((r) => ({
    model_name: r.MODEL_NAME,
    credits: Number(Number(r.CREDITS ?? 0).toFixed(4)),
    requests: Number(r.REQUESTS ?? 0),
    input_tokens: `${(Number(r.INPUT_TOKENS ?? 0) / 1000).toFixed(1)}k`,
    output_tokens: `${(Number(r.OUTPUT_TOKENS ?? 0) / 1000).toFixed(1)}k`,
  }))

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
          {budgets.length > 0 ? (
            budgets.map((b, i) => (
              <Grid key={i} size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard
                  label={`Budget: ${b.BUDGET_NAME} (${Number(b.SPENT_CREDITS ?? 0).toFixed(1)}/${Number(b.BUDGET_CREDITS ?? 0).toFixed(0)} cr, ${b.BUDGET_PERIOD})`}
                  value={`${b.PCT_USED ?? 0}%`}
                  accent="var(--mui-palette-warning-main)"
                  valueColor={b.OVER_THRESHOLD ? "var(--mui-palette-error-main)" : undefined}
                  icon={<WalletIcon fontSize="var(--icon-fontSize-lg)" />}
                />
              </Grid>
            ))
          ) : null}

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

          {modelCategories.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <BarChartCard
                title="Credits by Model"
                subheader="Total AI Credits per model (from granular usage data)"
                categories={modelCategories}
                data={modelCredits}
                seriesName="Credits"
                format={{ decimals: 2 }}
              />
            </Grid>
          ) : null}

          {userRows.length > 0 ? (
            <Grid size={{ xs: 12, lg: 6 }}>
              <DataTableCard
                title="Top Users by Spend"
                subheader="Per-user credit attribution (chargeback)"
                pageSize={5}
                defaultSortKey="credits"
                defaultSortDir="desc"
                columns={[
                  { key: "user_name", label: "User" },
                  { key: "credits", label: "Credits", type: "number" },
                  { key: "requests", label: "Requests", type: "number" },
                  { key: "tokens", label: "Tokens", type: "number" },
                ]}
                rows={userRows}
                emptyMessage="No per-user data yet."
              />
            </Grid>
          ) : null}

          {modelRows.length > 0 ? (
            <Grid size={{ xs: 12 }}>
              <DataTableCard
                title="Per-Model Breakdown"
                subheader="Credits and tokens by model"
                pageSize={10}
                defaultSortKey="credits"
                defaultSortDir="desc"
                columns={[
                  { key: "model_name", label: "Model" },
                  { key: "credits", label: "Credits", type: "number" },
                  { key: "requests", label: "Requests", type: "number" },
                  { key: "input_tokens", label: "Input Tokens", type: "number" },
                  { key: "output_tokens", label: "Output Tokens", type: "number" },
                ]}
                rows={modelRows}
                emptyMessage="No per-model data yet."
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
