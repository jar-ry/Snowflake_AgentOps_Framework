import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { pivotByDate } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { KpiCard } from "../components/cards/kpi-card"
import { LineChartCard, type LineSeries } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function AccuracyPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())
  const conds: string[] = []
  if (agent) conds.push(`target_name = '${agent}'`)
  if (envVal) conds.push(`environment = '${envVal}'`)
  const agentFilter = conds.length ? `WHERE ${conds.join(" AND ")}` : ""

  let trends: Record<string, any>[] = []
  let chartRows: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT target_name FROM V_EVAL_ACCURACY_TREND ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.TARGET_NAME).filter(Boolean)

    trends = await querySnowflake(`
      SELECT
        eval_date,
        eval_type,
        environment,
        target_name,
        accuracy_pct,
        threshold_pct,
        passed_threshold,
        accuracy_delta
      FROM V_EVAL_ACCURACY_TREND
      ${agentFilter}
      ORDER BY eval_date DESC
      LIMIT 50
    `)

    chartRows = await querySnowflake(`
      SELECT eval_date, eval_type, target_name, accuracy_pct, threshold_pct
      FROM V_EVAL_ACCURACY_TREND
      ${agentFilter}
      ${agentFilter ? "AND" : "WHERE"} eval_date >= DATEADD('day', -${win.days}, CURRENT_DATE())
      ORDER BY eval_date ASC
    `)
  } catch (e) {
    error = friendlyError("accuracy", e)
  }

  const { data: chartData, seriesNames } = pivotByDate(chartRows, "EVAL_DATE", "TARGET_NAME", "ACCURACY_PCT")
  const evalTypeByTarget: Record<string, string> = {}
  for (const r of chartRows) evalTypeByTarget[String(r.TARGET_NAME)] = String(r.EVAL_TYPE)
  const categories = chartData.map((r) => r.DATE)
  const series: LineSeries[] = seriesNames.map((name) => ({
    name: evalTypeByTarget[name] === "semantic_view" ? `${name} (SV)` : name,
    data: chartData.map((r) => (r[name] == null ? null : Number(r[name]))),
    dashed: evalTypeByTarget[name] === "semantic_view",
  }))
  const thresholdPct = chartRows.length ? Number(chartRows[0].THRESHOLD_PCT) || 85 : 85

  // Latest run per target for the summary cards.
  const latestByTarget: Record<string, any>[] = []
  const seenTargets = new Set<string>()
  for (const r of trends) {
    const k = String(r.TARGET_NAME)
    if (!seenTargets.has(k)) {
      seenTargets.add(k)
      latestByTarget.push(r)
    }
  }

  const trendRows = trends.map((r) => ({
    eval_date: r.EVAL_DATE,
    eval_type: r.EVAL_TYPE,
    target_name: r.TARGET_NAME,
    accuracy: `${r.ACCURACY_PCT}%`,
    threshold: `${r.THRESHOLD_PCT}%`,
    delta: r.ACCURACY_DELTA != null ? `${r.ACCURACY_DELTA > 0 ? "+" : ""}${r.ACCURACY_DELTA}%` : "—",
    passed: r.PASSED_THRESHOLD ? "Pass" : "Fail",
    passed_threshold: !!r.PASSED_THRESHOLD,
    accuracy_delta: r.ACCURACY_DELTA == null ? null : Number(r.ACCURACY_DELTA),
  }))

  return (
    <Box>
      <PageHeader
        title="Evaluation Accuracy"
        subtitle="Accuracy over time for semantic view and agent evaluations"
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
          {latestByTarget.map((r, i) => (
            <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={i}>
              <KpiCard
                label={`${r.TARGET_NAME} (${r.EVAL_TYPE === "semantic_view" ? "SV" : "agent"})`}
                value={`${r.ACCURACY_PCT}%`}
                valueColor={r.PASSED_THRESHOLD ? undefined : "var(--mui-palette-error-main)"}
                delta={r.ACCURACY_DELTA != null ? { value: Number(r.ACCURACY_DELTA), suffix: "pp", decimals: 1 } : undefined}
              />
            </Grid>
          ))}

          {chartData.length > 0 ? (
            <Grid size={{ xs: 12 }}>
              <LineChartCard
                title="Accuracy % Over Time"
                subheader={`Dashed = semantic-view evals, solid = agent evals. Red dashed line is the pass threshold (${thresholdPct}%).`}
                categories={categories}
                series={series}
                threshold={{ value: thresholdPct, label: `Threshold ${thresholdPct}%` }}
                format={{ suffix: "%" }}
                yMin={70}
                yMax={100}
                sparse
              />
            </Grid>
          ) : null}

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Evaluation Runs"
              subheader="Latest 50 runs. Open the Resolve action on failing/regressing rows for guidance."
              pageSize={10}
              defaultSortKey="eval_date"
              defaultSortDir="desc"
              columns={[
                { key: "eval_date", label: "Date", headerInfo: "The date this evaluation run was executed." },
                { key: "eval_type", label: "Type", headerInfo: "'semantic_view' measures text-to-SQL accuracy; 'agent' measures full agent orchestration." },
                { key: "target_name", label: "Target", headerInfo: "The agent or semantic view that was evaluated." },
                { key: "accuracy", label: "Accuracy", type: "number", headerInfo: "Percent of question-bank questions answered correctly in this run." },
                { key: "threshold", label: "Threshold", type: "number", headerInfo: "Minimum accuracy required to pass the CI quality gate." },
                { key: "delta", label: "Delta", type: "number", headerInfo: "Change vs the previous run. Negative means a regression." },
                { key: "passed", label: "Passed", type: "severity", headerInfo: "Whether this run met the accuracy threshold." },
                { key: "resolve", label: "Resolve", type: "guidance-accuracy" },
              ]}
              rows={trendRows}
              emptyMessage="No evaluation runs found yet."
            />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
