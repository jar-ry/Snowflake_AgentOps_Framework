import Grid from "@mui/material/Grid"
import Box from "@mui/material/Box"

import { querySnowflake } from "@/lib/snowflake"
import { friendlyError } from "@/lib/errors"
import { toDateStr } from "@/lib/chart-data"
import { parseWindow } from "@/lib/window"
import { pickEnv } from "@/lib/env"
import { getEnvironments } from "@/lib/environments"
import { safeIdent } from "@/lib/sql"
import { S } from "@/lib/agentops.config"
import { AgentFilter } from "../components/agent-filter"
import { TimeWindow } from "../components/time-window"
import { PageHeader } from "../components/layout/page-header"
import { KpiCard } from "../components/cards/kpi-card"
import { LineChartCard, StackedBarChartCard } from "../components/cards/chart-cards"
import { DataTableCard } from "../components/cards/data-table-card"
import { ThumbsUpIcon } from "@phosphor-icons/react/dist/ssr/ThumbsUp"
import { ThumbsDownIcon } from "@phosphor-icons/react/dist/ssr/ThumbsDown"
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText"

export const dynamic = "force-dynamic"

interface Props {
  searchParams: Promise<{ agent?: string; window?: string; env?: string }>
}

export default async function FeedbackPage({ searchParams }: Props) {
  const { agent: agentRaw, window, env } = await searchParams
  const agent = safeIdent(agentRaw)
  const win = parseWindow(window)
  const envVal = pickEnv(env, await getEnvironments())

  const trendConds: string[] = [`summary_date >= DATEADD('day', -${win.days}, CURRENT_DATE())`]
  if (agent) trendConds.push(`agent_or_sv_name = '${agent}'`)
  if (envVal) trendConds.push(`environment = '${envVal}'`)
  const trendWhere = `WHERE ${trendConds.join(" AND ")}`

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
      SELECT DISTINCT agent_or_sv_name FROM ${S}FEEDBACK_DAILY_SUMMARY WHERE agent_or_sv_name IS NOT NULL ORDER BY 1
    `)
    agents = agentRows.map((r: any) => r.AGENT_OR_SV_NAME).filter(Boolean)

    const kpiRows = await querySnowflake(`
      SELECT
        COALESCE(SUM(total_feedback), 0) AS total_feedback,
        COALESCE(SUM(positive_count), 0) AS thumbs_up,
        COALESCE(SUM(negative_count), 0) AS thumbs_down,
        ROUND(SUM(positive_count) * 100.0 / NULLIF(SUM(total_feedback), 0), 1) AS thumbs_up_pct,
        ROUND(SUM(negative_count) * 100.0 / NULLIF(SUM(total_feedback), 0), 1) AS thumbs_down_pct
      FROM ${S}FEEDBACK_DAILY_SUMMARY
      ${trendWhere}
    `)
    kpis = kpiRows[0] ?? null

    trend = await querySnowflake(`
      SELECT
        summary_date,
        SUM(total_feedback) AS total_feedback,
        SUM(positive_count) AS thumbs_up,
        SUM(negative_count) AS thumbs_down,
        ROUND(SUM(negative_count) * 100.0 / NULLIF(SUM(total_feedback), 0), 1) AS thumbs_down_pct
      FROM ${S}V_FEEDBACK_TREND
      ${trendWhere}
      GROUP BY summary_date
      ORDER BY summary_date ASC
    `)

    recent = await querySnowflake(`
      SELECT created_at, environment, agent_or_sv_name,
             CASE WHEN feedback_rating = 1 THEN 'thumbs_up' ELSE 'thumbs_down' END AS thumbs,
             feedback_text
      FROM ${S}USER_FEEDBACK
      ${rawWhere}
      ORDER BY created_at DESC
      LIMIT 100
    `)
  } catch (e) {
    error = friendlyError("feedback", e)
  }

  const categories = trend.map((r) => toDateStr(r.SUMMARY_DATE))
  const thumbsSeries = [
    { name: "Thumbs Up", data: trend.map((r) => Number(r.THUMBS_UP ?? 0)) },
    { name: "Thumbs Down", data: trend.map((r) => Number(r.THUMBS_DOWN ?? 0)) },
  ]
  const thumbsDownPctData = trend.map((r) => (r.THUMBS_DOWN_PCT == null ? null : Number(r.THUMBS_DOWN_PCT)))

  const recentRows = recent.map((r) => ({
    created_at: r.CREATED_AT,
    environment: r.ENVIRONMENT,
    agent_or_sv_name: r.AGENT_OR_SV_NAME,
    thumbs: r.THUMBS === "thumbs_up" ? "👍" : "👎",
    comment: r.FEEDBACK_TEXT,
  }))

  return (
    <Box>
      <PageHeader
        title="User Feedback"
        subtitle="Direct user signals — thumbs up and thumbs down"
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
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="Thumbs Up" value={`${kpis.THUMBS_UP_PCT ?? 0}%`} accent="var(--mui-palette-success-main)" icon={<ThumbsUpIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="Thumbs Down" value={`${kpis.THUMBS_DOWN_PCT ?? 0}%`} accent="var(--mui-palette-error-main)" valueColor={Number(kpis.THUMBS_DOWN_PCT) >= 25 ? "var(--mui-palette-error-main)" : undefined} icon={<ThumbsDownIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <KpiCard label="Total Feedback" value={Number(kpis.TOTAL_FEEDBACK ?? 0).toLocaleString()} accent="var(--mui-palette-info-main)" icon={<ChatCircleTextIcon fontSize="var(--icon-fontSize-lg)" />} />
              </Grid>
            </>
          ) : null}

          {trend.length > 0 ? (
            <Grid size={{ xs: 12, lg: 7 }}>
              <StackedBarChartCard
                title="Thumbs Up / Down"
                subheader="Daily feedback volume"
                categories={categories}
                series={thumbsSeries}
                format={{ decimals: 0 }}
              />
            </Grid>
          ) : null}

          {trend.length > 0 ? (
            <Grid size={{ xs: 12, lg: 5 }}>
              <LineChartCard
                title="Thumbs Down %"
                subheader="Above 25% triggers negative-feedback-spike alert"
                categories={categories}
                series={[{ name: "Thumbs Down %", data: thumbsDownPctData }]}
                threshold={{ value: 25, label: "Alert threshold 25%" }}
                format={{ suffix: "%" }}
                yMin={0}
              />
            </Grid>
          ) : null}

          <Grid size={{ xs: 12 }}>
            <DataTableCard
              title="Recent Feedback"
              subheader="Most recent 100 entries"
              pageSize={10}
              defaultSortKey="created_at"
              defaultSortDir="desc"
              columns={[
                { key: "created_at", label: "When" },
                { key: "environment", label: "Env" },
                { key: "agent_or_sv_name", label: "Target" },
                { key: "thumbs", label: "Thumbs" },
                { key: "comment", label: "Comment" },
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
