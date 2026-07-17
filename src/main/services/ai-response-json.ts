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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function firstDefined(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) return record[key]
  }
  return undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function optionalText(value: unknown): string | undefined {
  if (value === null) return ''
  return stringValue(value)
}

function optionalComplexity(value: unknown): string | null | undefined {
  if (value === null) return null
  return stringValue(value)
}

function normalizeConfidence(value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value.trim().replace(/%$/u, ''))
        : Number.NaN
  if (!Number.isFinite(parsed)) return 0.5
  const normalized = parsed > 1 && parsed <= 100 ? parsed / 100 : parsed
  return Math.min(1, Math.max(0, normalized))
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.flatMap(item => {
      const text = stringValue(item)
      return text ? [text] : []
    })
  }
  const text = stringValue(value)
  return text
    ? text
        .split(/[,，]/u)
        .map(item => item.trim())
        .filter(Boolean)
    : undefined
}

function normalizeCategoryPath(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const categories = value.flatMap(item => {
      const text = stringValue(item)
      return text ? [text] : []
    })
    return categories.length > 0 ? categories : undefined
  }
  const text = stringValue(value)
  if (!text) return undefined
  const categories = text
    .replace(/\\/gu, '/')
    .split(/\s*(?:\/|>|›|→)\s*/u)
    .map(item => item.trim())
    .filter(Boolean)
  return categories.length > 0 ? categories : undefined
}

function unwrapTemplateClassification(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  if (
    firstDefined(value, [
      'categoryPath',
      'category_path',
      'categories',
      'relativePath',
      'relative_path',
      'suggestedRelativePath',
    ]) !== undefined
  ) {
    return value
  }
  for (const key of ['classification', 'data', 'output', 'result', 'template']) {
    const nested = value[key]
    if (isRecord(nested)) return nested
  }
  return value
}

export function normalizeTemplateClassificationEnvelope(
  value: unknown,
  options: {
    existingDirectories: ReadonlySet<string>
    fallbackFileName: string
    outputLanguage: 'en' | 'zh-CN'
  },
): unknown {
  const record = unwrapTemplateClassification(value)
  if (!record) return value

  const pathValue = stringValue(
    firstDefined(record, [
      'relativePath',
      'relative_path',
      'suggestedRelativePath',
      'suggested_relative_path',
      'path',
    ]),
  )
  const pathSegments = pathValue
    ?.replace(/\\/gu, '/')
    .split('/')
    .map(segment => segment.trim())
    .filter(Boolean)
  const categoryPath =
    normalizeCategoryPath(firstDefined(record, ['categoryPath', 'category_path', 'categories'])) ??
    (pathSegments && pathSegments.length > 1 ? pathSegments.slice(0, -1) : undefined)
  if (!categoryPath) return value

  const rawFileName =
    stringValue(firstDefined(record, ['fileName', 'file_name', 'filename', 'name'])) ??
    pathSegments?.at(-1) ??
    options.fallbackFileName.trim()
  const fileName = rawFileName.replace(/\\/gu, '/').split('/').at(-1)?.trim() ?? ''
  const targetDirectory = categoryPath.join('/')
  let existingParentPath = ''
  let existingDepth = 0
  for (let depth = categoryPath.length; depth > 0; depth -= 1) {
    const candidate = categoryPath.slice(0, depth).join('/')
    if (options.existingDirectories.has(candidate)) {
      existingParentPath = candidate
      existingDepth = depth
      break
    }
  }
  const rawPlacement = isRecord(record.placement) ? record.placement : null
  const classificationReason =
    stringValue(
      firstDefined(record, [
        'classificationReason',
        'classification_reason',
        'reason',
        'explanation',
      ]),
    ) ??
    (options.outputLanguage === 'en'
      ? 'The model did not provide a classification reason. Review the suggested directory before saving.'
      : '模型未提供分类理由，请在保存前重点核对建议目录。')
  const placementReason =
    stringValue(rawPlacement?.reason) ??
    (options.outputLanguage === 'en'
      ? 'The placement mode was derived locally from the current workspace directories.'
      : '放置方式已根据当前工作区真实目录在本地推导。')
  const alternatives = Array.isArray(record.alternatives)
    ? record.alternatives.flatMap(alternative => {
        if (!isRecord(alternative)) return []
        const alternativeTarget = stringValue(
          firstDefined(alternative, ['targetDirectory', 'target_directory', 'path']),
        )
        if (!alternativeTarget) return []
        return [
          {
            confidence: normalizeConfidence(alternative.confidence),
            reason: stringValue(alternative.reason) ?? '',
            targetDirectory: alternativeTarget.replace(/\\/gu, '/'),
          },
        ]
      })
    : []

  return {
    alternatives,
    categoryPath,
    classificationReason,
    commonMistakes: optionalText(firstDefined(record, ['commonMistakes', 'common_mistakes'])),
    confidence: normalizeConfidence(record.confidence),
    constraints: optionalText(record.constraints),
    fileName,
    placement: {
      existingParentPath,
      mode:
        existingDepth === categoryPath.length
          ? 'existing-directory'
          : existingDepth > 0
            ? 'create-subdirectory'
            : 'create-category-chain',
      newDirectories: categoryPath.slice(existingDepth),
      reason: placementReason,
      targetDirectory,
    },
    prerequisites: optionalText(record.prerequisites),
    solves: optionalText(firstDefined(record, ['solves', 'solvedProblem', 'solved_problem'])),
    spaceComplexity: optionalComplexity(
      firstDefined(record, ['spaceComplexity', 'space_complexity']),
    ),
    tags: normalizeStringList(record.tags),
    timeComplexity: optionalComplexity(firstDefined(record, ['timeComplexity', 'time_complexity'])),
  }
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

export function normalizeCommonAiEnvelope(value: unknown): unknown {
  let current = value
  for (let depth = 0; depth < 3; depth += 1) {
    if (!isRecord(current)) return current
    const keys = Object.keys(current)
    if (keys.length !== 1) return current
    const nested = current[keys[0]!]
    if (!['data', 'output', 'response', 'result'].includes(keys[0]!)) return current
    if (!isRecord(nested) && !Array.isArray(nested)) return current
    current = nested
  }
  return current
}

export function normalizeFilePlanEnvelope(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { operations: value, summary: '' }
  }
  if (!isRecord(value)) {
    return value
  }
  const record = value
  if (Array.isArray(record.operations)) {
    return {
      operations: record.operations,
      summary: typeof record.summary === 'string' ? record.summary : '',
    }
  }
  for (const key of ['plan', 'data', 'result']) {
    const nested = record[key]
    if (
      nested &&
      typeof nested === 'object' &&
      Array.isArray((nested as Record<string, unknown>).operations)
    ) {
      const nestedRecord = nested as Record<string, unknown>
      return {
        operations: nestedRecord.operations,
        summary:
          typeof nestedRecord.summary === 'string'
            ? nestedRecord.summary
            : typeof record.summary === 'string'
              ? record.summary
              : '',
      }
    }
  }
  return value
}
