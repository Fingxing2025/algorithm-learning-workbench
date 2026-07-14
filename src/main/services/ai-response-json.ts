function extractBalancedJson(text: string): string[] {
  const candidates: string[] = []
  let escaped = false
  let inString = false
  let start = -1
  const stack: string[] = []

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (start < 0) {
      if (character === '{' || character === '[') {
        start = index
        stack.push(character === '{' ? '}' : ']')
      }
      continue
    }
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      continue
    }
    if (character === '"') {
      inString = true
    } else if (character === '{') {
      stack.push('}')
    } else if (character === '[') {
      stack.push(']')
    } else if (character === '}' || character === ']') {
      if (stack.at(-1) !== character) {
        start = -1
        stack.length = 0
        continue
      }
      stack.pop()
      if (stack.length === 0) {
        candidates.push(text.slice(start, index + 1))
        start = -1
      }
    }
  }
  return candidates
}

export function parseAiJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(match =>
    match[1]!.trim(),
  )
  const candidates = [...new Set([trimmed, ...fenced, ...extractBalancedJson(trimmed)])]
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // Try the next complete JSON segment without exposing provider output in an error.
    }
  }
  throw new SyntaxError('AI response does not contain a complete JSON value')
}

export function normalizeFilePlanEnvelope(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { operations: value }
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record.operations)) {
    return { operations: record.operations }
  }
  for (const key of ['plan', 'data', 'result']) {
    const nested = record[key]
    if (
      nested &&
      typeof nested === 'object' &&
      Array.isArray((nested as Record<string, unknown>).operations)
    ) {
      return { operations: (nested as Record<string, unknown>).operations }
    }
  }
  return value
}
