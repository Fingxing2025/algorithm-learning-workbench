export const MAX_SOURCE_BYTES = 2 * 1024 * 1024
export const MAX_AI_SOURCE_CHARS = 120_000
export const MAX_SIMILARITY_CANDIDATE_PAIRS = 50_000
export const MAX_BATCH_CPP_FILES = 100
export const MAX_BATCH_SOURCE_BYTES = 20 * 1024 * 1024
export const TEMPLATE_METADATA_MAX_OUTPUT_TOKENS = 32_768
// Batch classification deliberately uses much smaller per-call budgets than
// the provider's 1 MiB response guard.  8k/4k tokens leave ample headroom even
// when a provider emits multi-byte JSON and a little framing around it.
export const BATCH_GLOBAL_FACTS_MAX_OUTPUT_TOKENS = 8_192
export const BATCH_DETAIL_MAX_OUTPUT_TOKENS = 4_096
export const BATCH_DETAIL_SIZE = 4
export const AI_RESPONSE_SAFE_ESTIMATE_BYTES = 900 * 1024

export function estimateBatchClassificationResponseBytes(maxOutputTokens: number): number {
  // Six bytes/token is intentionally conservative for Chinese JSON strings;
  // the fixed allowance covers JSON/schema/provider framing.
  return Math.ceil(Math.max(0, maxOutputTokens) * 6 + 16_384)
}
