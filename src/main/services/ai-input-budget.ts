export const BATCH_AI_MAX_ESTIMATED_INPUT_TOKENS = 32_000
export const BATCH_AI_CONTEXT_ESTIMATED_INPUT_TOKENS = 20_000
export const BATCH_AI_MAX_SOURCE_CHARS = 32_000

export interface CompactedAiSource {
  content: string
  originalCharacters: number
  truncated: boolean
  truncationStrategy: 'head-tail' | 'none'
}

export function compactAiSource(source: string, maxCharacters: number): CompactedAiSource {
  const normalizedLimit = Math.max(0, Math.floor(maxCharacters))
  if (source.length <= normalizedLimit) {
    return {
      content: source,
      originalCharacters: source.length,
      truncated: false,
      truncationStrategy: 'none',
    }
  }
  if (normalizedLimit === 0) {
    return {
      content: '',
      originalCharacters: source.length,
      truncated: true,
      truncationStrategy: 'head-tail',
    }
  }
  const marker = '\n/* ... AI_INPUT_HEAD_TAIL_TRUNCATED ... */\n'
  if (normalizedLimit <= marker.length) {
    return {
      content: marker.slice(0, normalizedLimit),
      originalCharacters: source.length,
      truncated: true,
      truncationStrategy: 'head-tail',
    }
  }
  const contentBudget = normalizedLimit - marker.length
  const headLength = Math.ceil(contentBudget / 2)
  const tailLength = contentBudget - headLength
  return {
    content: `${source.slice(0, headLength)}${marker}${source.slice(source.length - tailLength)}`,
    originalCharacters: source.length,
    truncated: true,
    truncationStrategy: 'head-tail',
  }
}
