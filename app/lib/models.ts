// Server-side fetch of the Cortex text-generation models available in this
// account, for the Settings model picker. Sourced from SNOWFLAKE.MODELS (the
// Cortex foundation-model schema) via SHOW MODELS, then filtered to the models
// usable with SNOWFLAKE.CORTEX.COMPLETE (drops embedding / guardrail / speech /
// extraction / rerank families).
//
// We read SHOW's `name` column directly rather than RESULT_SCAN(LAST_QUERY_ID())
// because the connection pool may run each statement on a different connection,
// which would make LAST_QUERY_ID() unreliable.

import { cache } from "react"

import { querySnowflake } from "./snowflake"

// Substrings that indicate a non-COMPLETE model (embeddings, guardrails,
// speech, document parsing, reranking, etc.).
const EXCLUDE = [
  "embed", "arctic", "guard", "voyage", "nv-embed", "multilingual",
  "twelvelabs", "pegasus", "marengo", "text2sql", "transcribe", "translate",
  "parse", "sentiment", "rerank", "all-models", "-e5-",
]

export const getModels = cache(async (): Promise<string[]> => {
  try {
    const rows = await querySnowflake(`SHOW MODELS IN SNOWFLAKE.MODELS`)
    const names = rows
      .map((r: Record<string, any>) => String(r.name ?? r.NAME ?? "").toLowerCase())
      .filter(Boolean)
      .filter((n) => !EXCLUDE.some((x) => n.includes(x)))
    return Array.from(new Set(names)).sort()
  } catch {
    return [] // permission/availability issue -> form falls back to free text
  }
})
