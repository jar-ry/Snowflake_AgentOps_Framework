import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { toDateStr } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { KpiCard } from "../components/cards/kpi-card"
import { LineChartCard, StackedBarChartCard } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { StarIcon } from "@phosphor-icons/react/dist/ssr/Star"
import { ThumbsDownIcon } from "@phosphor-icons/react/dist/ssr/ThumbsDown"
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText"
import { TrendUpIcon } from "@phosphor-icons/react/dist/ssr/TrendUp"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function FeedbackPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())

  // Trend view filters (summary_date based)
  const trendConds: string[] = [`summary_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
  if (agent) trendConds.push(`agent_or_sv_name = '${agent}'`)
  if (envVal) trendConds.push(`environment = '${envVal}'`)
  const trendWhere = `WHERE ${trendConds.join(" AND ")}`

  // Raw feedback filters (created_at based)
  const rawConds: string[] = [`created_at >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
  if (agent) rawConds.push(`agent_or_sv_name = '${agent}'`)
  if (envVal) rawConds.push(`environment = '${envVal}'`)
  const rawWhere = `WHERE ${rawConds.join(" AND ")}`

  let kpis: Record<string, any> | null = null
  let trend: Record<string, any>[] = []
  let recent: Record<string, any>[] = []
  let agents: string[] = []
  let error: string | null = null

  try {
    const agentRows = await querySnowflake(`
      SELECT DISTINCT agent_or_sv_name FROM USER_FEEDBACK WHERE agent_or_sv_name IS NOT NULL ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.AGENT_OR_SV_NAME).filter(Boolean)

    // Window-level KPIs
    const kpiRows = await querySnowflake(`
      SELECT
        COUNT(*) AS total_feedback,
        ROUND(AVG(rating), 2) AS avg_rating,
        SUM(IFF(sentiment = 'negative', 1, 0)) AS negative_count,
        ROUND(SUM(IFF(sentiment = 'negative', 1, 0)) * 100.0 / NULLIF(COUNT(*), 0), 1) AS negative_pct
      FROM USER_FEEDBACK
      ${rawWhere}
    `)
    kpis = kpiRows[0] ?? null

    // Daily trend (aggregate across agents/envs in scope)
    trend = await querySnowflake(`
      SELECT
        summary_date,
        SUM(total_feedback) AS total_feedback,
        SUM(positive_count) AS positive_count,
        SUM(neutral_count)  AS neutral_count,
        SUM(negative_count) AS negative_count,
        ROUND(SUM(negative_count) * 100.0 / NULLIF(SUM(total_feedback), 0), 1) AS negative_pct,
        ROUND(SUM(avg_rating * total_feedback) / NULLIF(SUM(total_feedback), 0), 2) AS avg_rating
      FROM V_FEEDBACK_TREND
      ${trendWhere}
      GROUP BY summary_date
      ORDER BY summary_date ASC
    `)

    // Recent feedback rows
    recent = await querySnowflake(`
      SELECT created_at, environment, agent_or_sv_name, rating, sentiment, comment
      FROM USER_FEEDBACK
      ${rawWhere}
      ORDER BY created_at DESC
      LIMIT 100
    `)
  } catch (e) {
    error = friendlyError("feedback", e)
  }

  // 7-day rolling avg rating (last 7 days of the trend)
  const last7 = trend.slice(-7)
  const rolling7Avg =
    last7.length > 0
      ? (last7.reduce((a, r) => a + Number(r.AVG_RATING ?? 0) * Number(r.TOTAL_FEEDBACK ?? 0), 0) /
          Math.max(last7.reduce((a, r) => a + Number(r.TOTAL_FEEDBACK ?? 0), 0), 1)).toFixed(2)
      : "N/A"

  const categories = trend.map((r) => toDateStr(r.SUMMARY_DATE))
  const sentimentSeries = [
    { name: "Positive", data: trend.map((r) => Number(r.POSITIVE_COUNT ?? 0)) },
    { name: "Neutral", data: trend.map((r) => Number(r.NEUTRAL_COUNT ?? 0)) },
    { name: "Negative", data: trend.map((r) => Number(r.NEGATIVE_COUNT ?? 0)) },
  ]
  const negPctData = trend.map((r) => (r.NEGATIVE_PCT == null ? null : Number(r.NEGATIVE_PCT)))

  const recentRows = recent.map((r) => ({
    created_at: r.CREATED_AT,
    environment: r.ENVIRONMENT,
    agent_or_sv_name: r.AGENT_OR_SV_NAME,
    rating: Number(r.RATING),
    sentiment: r.SENTIMENT,
    comment: r.COMMENT,
  }))

  return (
    <Box>
      <PageHeader
        title="User Feedback"
        subtitle="Ratings and sentiment trends from end users"
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
          {kpis ? (
            <>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Avg Rating" value={`${kpis.AVG_RATING ?? "N/A"}/5`} accent="var(--mui-palette-success-main)" icon={<StarIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="7-Day Avg Rating" value={`${rolling7Avg}/5`} accent="var(--mui-palette-primary-main)" icon={<TrendUpIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Negative %" value={`${kpis.NEGATIVE_PCT ?? 0}%`} accent="var(--mui-palette-error-main)" valueColor={Number(kpis.NEGATIVE_PCT) >= 25 ? "var(--mui-palette-error-main)" : undefined} icon={<ThumbsDownIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <KpiCard label="Total Feedback" value={Number(kpis.TOTAL_FEEDBACK ?? 0).toLocaleString()} accent="var(--mui-palette-info-main)" icon={<ChatCircleTextIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
            </>
          ) : null}

          {trend.length > 0 ? (
            <Grid size={{ xs: 12, lg: 7 }}>
              <StackedBarChartCard
                title="Sentiment Distribution"
                subheader="Daily feedback volume split by sentiment"
                categories={categories}
                series={sentimentSeries}
                format={{ decimals: 0 }}
              />
            </Grid>
          ) : null}

          {trend.length > 0 ? (
            <Grid size={{ xs: 12, lg: 5 }}>
              <LineChartCard
                title="Negative Feedback %"
                subheader="Above the 25% line triggers a negative-feedback-spike alert"
                categories={categories}
                series={[{ name: "Negative %", data: negPctData }]}
                threshold={{ value: 25, label: "Alert threshold 25%" }}
                format={{ suffix: "%" }}
                yMin={0}
              />
            </Grid>
          ) : null}

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Recent Feedback"
              subheader="Most recent 100 feedback entries"
              pageSize={10}
              defaultSortKey="created_at"
              defaultSortDir="desc"
              columns={[
                { key: "created_at", label: "When", headerInfo: "When the feedback was submitted." },
                { key: "environment", label: "Env", headerInfo: "The environment the interaction ran in." },
                { key: "agent_or_sv_name", label: "Target", headerInfo: "The agent or semantic view the feedback is about." },
                { key: "rating", label: "Rating", type: "number", headerInfo: "User rating 1-5." },
                { key: "sentiment", label: "Sentiment", type: "severity", headerInfo: "Derived sentiment: positive / neutral / negative." },
                { key: "comment", label: "Comment", headerInfo: "The user's free-text comment." },
              ]}
              rows={recentRows}
              emptyMessage="No feedback in this period."
            />
          </Grid>
        </Grid>
      )}
    </Box>
  )
}
