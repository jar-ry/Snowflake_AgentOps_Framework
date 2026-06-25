"use client";

import * as React from "react";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import { InfoIcon } from "@phosphor-icons/react/dist/ssr/Info";
import { QuestionIcon } from "@phosphor-icons/react/dist/ssr/Question";

/** Small hover tooltip for column headers / short explanatory text. */
export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip title={text} arrow placement="top">
      <Box component="span" sx={{ display: "inline-flex", verticalAlign: "middle", ml: 0.5, color: "text.disabled", cursor: "help" }}>
        <InfoIcon fontSize="var(--icon-fontSize-sm)" />
      </Box>
    </Tooltip>
  );
}

interface Guidance {
  title: string;
  description: string;
  steps: string[];
  docLink?: string;
  cocoCommand?: string;
}

function GuidancePopover({ guidance }: { guidance: Guidance }) {
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)} aria-label={`Help: ${guidance.title}`}>
        <QuestionIcon fontSize="var(--icon-fontSize-sm)" />
      </IconButton>
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{ paper: { sx: { p: 2, maxWidth: 380 } } }}
      >
        <Typography variant="subtitle1" gutterBottom>
          {guidance.title}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {guidance.description}
        </Typography>
        <Typography variant="subtitle2" sx={{ mt: 1 }}>
          How to resolve:
        </Typography>
        <Box component="ol" sx={{ pl: 2.5, m: 0, "& li": { mb: 0.5 } }}>
          {guidance.steps.map((s, i) => (
            <Typography key={i} component="li" variant="body2" color="text.secondary">
              {s}
            </Typography>
          ))}
        </Box>
        {guidance.docLink ? (
          <Typography variant="body2" sx={{ mt: 1 }}>
            <Link href={guidance.docLink} target="_blank" rel="noopener noreferrer">
              Snowflake Docs &rarr;
            </Link>
          </Typography>
        ) : null}
        {guidance.cocoCommand ? (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            <strong>Cortex Code:</strong> <code>{guidance.cocoCommand}</code>
          </Typography>
        ) : null}
      </Popover>
    </>
  );
}

export function AlertGuidance({ alertType }: { alertType: string }) {
  const g = ALERT_GUIDANCE[alertType] || ALERT_GUIDANCE.default;
  return <GuidancePopover guidance={g} />;
}

export function QualityFlagGuidance({ flag }: { flag: string }) {
  const g = QUALITY_FLAG_GUIDANCE[flag] || QUALITY_FLAG_GUIDANCE.default;
  return <GuidancePopover guidance={g} />;
}

export function AccuracyGuidance({ passed, delta }: { passed: boolean; delta: number | null }) {
  // Only surface guidance when there is a problem (failing or regressing).
  if (passed && (delta === null || delta >= 0)) return null;
  const isRegression = delta !== null && delta < 0;
  const g = isRegression ? ACCURACY_GUIDANCE.regression : ACCURACY_GUIDANCE.failed;
  return <GuidancePopover guidance={g} />;
}

// --- Guidance data (ported from v2.1 tooltips) ---

const ALERT_GUIDANCE: Record<string, Guidance> = {
  negative_feedback_spike: {
    title: "Negative Feedback Spike",
    description: "More than 25% of user feedback was negative. This usually indicates the agent is generating incorrect or unhelpful answers for common queries.",
    steps: [
      "Review the negative feedback in the USER_FEEDBACK table to identify patterns.",
      "Add the problematic queries as 'hard' questions to your question bank.",
      "Check if the semantic view descriptions need improvement for those query patterns.",
      "Run an evaluation to measure current accuracy.",
      "If the semantic view has gaps, add verified queries (VQRs) to cover the failing patterns.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/verified-queries",
    cocoCommand: "/semantic-view (to improve your semantic view with VQRs)",
  },
  accuracy_regression: {
    title: "Accuracy Regression",
    description: "Evaluation accuracy dropped by more than 10% compared to the previous run. A recent change to the semantic view or agent may have broken existing queries.",
    steps: [
      "Check git history for recent changes to the semantic view YAML.",
      "Review the SEMANTIC_VIEW_EVAL_DETAILS table to find which questions now fail.",
      "Add the failing questions to your question bank so CI catches this in future.",
      "Run the audit to check for structural issues.",
      "Consider reverting the change and re-testing with a broader question bank.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/semantic-view-best-practices",
    cocoCommand: "/semantic-view (to debug and fix your semantic view)",
  },
  latency_degradation: {
    title: "Latency Degradation",
    description: "P95 latency exceeded 30 seconds. The agent is taking too long to respond, likely due to complex queries, large result sets, or warehouse contention.",
    steps: [
      "Check the V_AGENT_USAGE_PATTERNS view for which queries are slowest.",
      "Review warehouse utilization — consider scaling up or using a dedicated warehouse.",
      "Check if the agent is looping (see Quality tab for tool_looping flags).",
      "Optimize slow semantic view queries by adding search optimization or clustering keys.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/warehouses-sizing",
  },
  cost_anomaly: {
    title: "Cost Anomaly",
    description: "Daily AI credit consumption was well above the recent average. This could be a traffic spike or an agent stuck in a loop burning tokens.",
    steps: [
      "Check V_AGENT_USAGE_PATTERNS for unusual request counts.",
      "Look for agents with high token burn in the Quality tab (flag_high_token_burn).",
      "Review if a new deployment introduced more complex orchestration steps.",
      "Consider enabling prompt caching to reduce redundant token costs.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agent",
  },
  error_spike: {
    title: "Error Spike",
    description: "Error rate exceeded 10%. The agent or analyst is failing on a significant portion of requests.",
    steps: [
      "Query AGENT_TRACES where status_code != 'STATUS_CODE_OK' to see error details.",
      "Check if a semantic view was dropped/recreated (causes agent binding failures).",
      "Verify warehouse is running and accessible to the agent's execution role.",
      "Run a health check.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agent#troubleshooting",
  },
  interaction_quality: {
    title: "Interaction Quality Issues",
    description: "More than 20% of requests are flagged with quality problems (looping, excessive steps, slow, high token burn, or errors).",
    steps: [
      "Review the Quality tab for specific flagged interactions.",
      "For tool looping: check if the semantic view has ambiguous column names causing repeated retries.",
      "For excessive steps: simplify the agent's tool configuration or add verified queries.",
      "For high token burn: ensure prompt caching is enabled and consider reducing context window.",
      "Add problematic user queries to your question bank as 'hard' questions for CI regression testing.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/verified-queries",
    cocoCommand: "/semantic-view (to add VQRs that short-circuit agent planning)",
  },
  default: {
    title: "Alert",
    description: "A monitoring threshold was breached.",
    steps: ["Check the alert message for specific details.", "Review the relevant monitoring view for trends.", "Run a health check."],
  },
};

const QUALITY_FLAG_GUIDANCE: Record<string, Guidance> = {
  flag_tool_looping: {
    title: "Tool Call Looping",
    description: "The agent called the same tool 3+ times in a single request. This usually means the semantic view returned ambiguous or incorrect SQL, and the agent retried.",
    steps: [
      "Check what query the user asked — it may require a verified query (VQR).",
      "Review the semantic view for ambiguous dimension/metric names.",
      "Add a VQR for this query pattern to short-circuit the retry loop.",
      "Add the query to your 'hard' question bank for CI regression testing.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/verified-queries",
  },
  flag_excessive_steps: {
    title: "Excessive Planning Steps",
    description: "The agent used 4+ planning steps. This means the orchestration model struggled to find the right approach.",
    steps: [
      "Review the agent's tool configuration — fewer tools means fewer decisions.",
      "Check if the query requires multi-step SQL that could be simplified with a view.",
      "Add a VQR so the analyst tool returns correct SQL on the first attempt.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agent#best-practices",
  },
  flag_slow_request: {
    title: "Slow Request (>60s)",
    description: "Total request duration exceeded 60 seconds. This impacts user experience.",
    steps: [
      "Check if the underlying SQL query is unoptimized (full table scans, large result sets).",
      "Consider adding clustering keys or search optimization on frequently queried columns.",
      "Scale up the warehouse if query compute is the bottleneck.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/tables-clustering-keys",
  },
  flag_high_token_burn: {
    title: "High Token Burn (>100k)",
    description: "A single request consumed over 100k tokens. This is expensive and usually indicates the agent context is too large.",
    steps: [
      "Check if the semantic view has too many tables/columns exposed — prune unused ones.",
      "Enable prompt caching to reduce redundant context tokens on follow-up turns.",
      "Review if the agent is including full query results in its planning context.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agent#cost",
  },
  flag_planning_error: {
    title: "Planning Error",
    description: "The agent's orchestration model returned an error during planning. This is a CRITICAL issue.",
    steps: [
      "Check AGENT_TRACES for the specific error message (status_message column).",
      "Verify the agent is still valid: DESCRIBE AGENT <fqn>.",
      "Check if bound semantic views or tools are accessible.",
      "If persistent, recreate the agent or contact Snowflake support.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agent#troubleshooting",
  },
  default: {
    title: "Quality Flag",
    description: "An interaction quality issue was detected.",
    steps: ["Review the flagged interaction details.", "Check the user query and agent response pattern."],
  },
};

const ACCURACY_GUIDANCE: Record<string, Guidance> = {
  regression: {
    title: "Accuracy Regression",
    description: "Accuracy dropped compared to the previous evaluation run. A recent change may have broken existing query patterns.",
    steps: [
      "Check SEMANTIC_VIEW_EVAL_DETAILS for which questions now fail (match_status = 'FAIL').",
      "Compare the generated SQL vs expected SQL to identify what changed.",
      "Review recent semantic view changes in git history.",
      "Add the failing queries as verified queries (VQRs) to ensure correct SQL generation.",
      "Re-run evaluation after fixing.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/verified-queries",
    cocoCommand: "/semantic-view (to add VQRs for failing queries)",
  },
  failed: {
    title: "Below Accuracy Threshold",
    description: "The evaluation did not meet the configured accuracy threshold. The semantic view needs improvement for the failing query patterns.",
    steps: [
      "Review which question categories are failing (easy/hard/ambiguous).",
      "For 'easy' failures: check that basic dimension and metric descriptions are clear.",
      "For 'hard' failures: add verified queries (VQRs) that provide the exact SQL template.",
      "Add user feedback queries to your question bank.",
      "Improve table/column descriptions in the semantic view to be more specific.",
      "Run the audit for structural issues.",
    ],
    docLink: "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/semantic-view-best-practices",
    cocoCommand: "/semantic-view (to improve descriptions and add VQRs)",
  },
};
