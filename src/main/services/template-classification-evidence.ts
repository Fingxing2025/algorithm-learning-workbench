import type {
  BatchTemplateClassificationFact,
  ClassificationProposalVersion,
  SourceCoverage,
  SourceEvidence,
  TemplateClassification,
} from '@core/contracts/template-management'
import {
  getCanonicalCategory,
  normalizeTaxonomyAlias,
  resolveCanonicalAlgorithmFamily,
} from '@core/domain/template-taxonomy'

export interface ClassificationSourceContext {
  content: string
  coverage: SourceCoverage
  originalCharacters: number
  truncated: boolean
  truncationStrategy: 'numbered-blocks'
}

/** Conservative line blocks with optional brace/blank boundary hints, not a C++
 * parser. Long lines are omitted whole rather than reported as covered lines. */
export function buildClassificationSourceContext(
  source: string,
  maxCharacters: number,
): ClassificationSourceContext {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Array<{ startLine: number; endLine: number; text: string }> = []
  let start = 0
  for (let i = 0; i < lines.length; i++) {
    if (
      i - start < 39 &&
      i < lines.length - 1 &&
      !(i - start >= 7 && /^(?:\s*}|\s*$)/.test(lines[i]!))
    )
      continue
    const text = lines
      .slice(start, i + 1)
      .map((line, offset) => `L${start + offset + 1}|${line}`)
      .join('\n')
    blocks.push({
      startLine: start + 1,
      endLine: i + 1,
      text: `[lines ${start + 1}-${i + 1}]\n${text}`,
    })
    start = i + 1
  }
  const limit = Math.max(0, Math.floor(maxCharacters))
  // Breadth-first spatial subdivision samples the middle as well as the ends.
  // Limit both context blocks and coverage intervals before serializing.
  const order: number[] = []
  const pending = [[0, blocks.length - 1]]
  while (pending.length && order.length < 256) {
    const [left, right] = pending.shift()!
    if (left! > right!) continue
    const middle = Math.floor((left! + right!) / 2)
    order.push(middle)
    pending.push([left!, middle - 1], [middle + 1, right!])
  }
  const chosen: typeof blocks = []
  let used = 0
  for (const index of order) {
    const block = blocks[index]!
    const cost = block.text.length + (chosen.length ? 2 : 0)
    if (used + cost > limit) continue
    chosen.push(block)
    used += cost
  }
  chosen.sort((a, b) => a.startLine - b.startLine)
  const ranges: SourceCoverage['ranges'] = []
  for (const block of chosen) {
    const previous = ranges.at(-1)
    if (previous && previous.endLine + 1 === block.startLine) previous.endLine = block.endLine
    else ranges.push({ startLine: block.startLine, endLine: block.endLine })
  }
  const coveredLines = ranges.reduce(
    (total, range) => total + range.endLine - range.startLine + 1,
    0,
  )
  const coverage = {
    totalLines: lines.length,
    coveredLines,
    omittedLines: lines.length - coveredLines,
    complete: coveredLines === lines.length,
    ranges,
  }
  return {
    content: chosen.map(block => block.text).join('\n\n'),
    coverage,
    originalCharacters: source.length,
    truncated: !coverage.complete,
    truncationStrategy: 'numbered-blocks',
  }
}

/** Mask comments and string/character literals while preserving offsets. This
 * is an evidence filter, not a language parser or an algorithm recognizer. */
function implementationMask(source: string): string {
  const result = source.split('')
  const erase = (from: number, to: number) => {
    for (let i = from; i < to; i++) if (result[i] !== '\n') result[i] = ' '
  }
  const lineCommentEnd = (from: number) => {
    let newline = source.indexOf('\n', from + 2)
    while (newline >= 0) {
      const splice = source[newline - 1] === '\r' ? newline - 2 : newline - 1
      if (source[splice] !== '\\') break
      newline = source.indexOf('\n', newline + 1)
    }
    return newline < 0 ? source.length : newline
  }
  const isNumericSeparator = (index: number) => {
    if (
      source[index] !== "'" ||
      !/[0-9A-Fa-f]/.test(source[index - 1] ?? '') ||
      !/[0-9A-Fa-f]/.test(source[index + 1] ?? '')
    )
      return false
    let tokenStart = index - 1
    while (tokenStart >= 0 && /[A-Za-z0-9_'.]/.test(source[tokenStart]!)) tokenStart--
    const prefix = source.slice(tokenStart + 1, index)
    return /^(?:[0-9]|\.[0-9])/.test(prefix)
  }
  for (let i = 0; i < source.length;) {
    let end = i
    if (source.startsWith('//', i)) {
      end = lineCommentEnd(i)
    } else if (source.startsWith('/*', i)) {
      const closing = source.indexOf('*/', i + 2)
      end = closing < 0 ? source.length : closing + 2
    } else if (source.startsWith('R"', i)) {
      const opening = source.slice(i).match(/^R"([^ ()\\\t\r\n]{0,16})\(/)
      if (opening) {
        const closing = source.indexOf(`)${opening[1]}"`, i + opening[0].length)
        end = closing < 0 ? source.length : closing + opening[1]!.length + 2
      }
    }
    if (end === i && (source[i] === '"' || (source[i] === "'" && !isNumericSeparator(i)))) {
      const quote = source[i]
      end = i + 1
      while (end < source.length) {
        if (source[end] === '\\') {
          end += 2
          continue
        }
        if (source[end++] === quote) break
      }
    }
    if (end > i) {
      erase(i, Math.min(end, source.length))
      i = end
    } else i++
  }
  // Header/import names are not implementation evidence.
  return result.join('').replace(/^[ \t]*#[^\n]*/gm, line => ' '.repeat(line.length))
}

export function validateSourceEvidence(
  source: string,
  context: ClassificationSourceContext,
  evidence: SourceEvidence[] = [],
) {
  const normalized = source.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const maskedLines = implementationMask(normalized).split('\n')
  return evidence.map(item => {
    const excerpt = lines.slice(item.startLine - 1, item.endLine).join('\n')
    const quote = item.quote.replace(/\r\n?/g, '\n')
    const quoteOffset = excerpt.indexOf(quote)
    const verified =
      item.startLine <= item.endLine &&
      item.endLine <= lines.length &&
      context.coverage.ranges.some(
        range => range.startLine <= item.startLine && range.endLine >= item.endLine,
      ) &&
      quote.trim().length > 0 &&
      quoteOffset >= 0
    const implementation = maskedLines
      .slice(item.startLine - 1, item.endLine)
      .join('\n')
      .slice(quoteOffset, quoteOffset + quote.length)
    const containsImplementation =
      verified && /\b(?:for|while|if|return)\b|(?:\+=|-=|\*=|\/=|=(?!=))/.test(implementation)
    return { ...item, verified, containsImplementation }
  })
}

export function reviewClassificationEvidence(
  classification: TemplateClassification,
  source: string,
  context: ClassificationSourceContext,
  evidence: SourceEvidence[] = [],
): TemplateClassification {
  const sourceEvidence = validateSourceEvidence(source, context, evidence)
  const reasons = new Set(classification.reviewReasons ?? [])
  if (!context.coverage.complete) reasons.add('partial-source-coverage')
  if (!sourceEvidence.length) reasons.add('missing-source-evidence')
  else if (!sourceEvidence.some(item => item.containsImplementation))
    reasons.add('missing-implementation-evidence')
  if (sourceEvidence.some(item => !item.verified)) reasons.add('invalid-source-evidence')
  if (!resolveCanonicalAlgorithmFamily(classification.algorithmFamily ?? ''))
    reasons.add('unknown-algorithm-family')
  if (classification.independentAlgorithmGoals) reasons.add('composite-algorithm')
  if (classification.categoryId && getCanonicalCategory(classification.categoryId)?.reviewRequired)
    reasons.add('generic-category')
  if (classification.confidence < 0.65) reasons.add('low-confidence')
  if (classification.alternatives.some(item => classification.confidence - item.confidence <= 0.1))
    reasons.add('close-alternatives')
  if (
    classification.categoryDecision === 'propose-new' ||
    classification.newCategoryProposal ||
    !classification.categoryId
  )
    reasons.add('new-category-proposal')
  if (classification.conflicts?.length) reasons.add('model-conflict')
  const version: ClassificationProposalVersion = {
    version: 1,
    source: 'detailed-source',
    categoryId: classification.categoryId ?? null,
    categoryPath: classification.categoryPath,
    algorithmFamily: classification.algorithmFamily ?? '',
    primaryTechnique: classification.primaryTechnique ?? '',
    variant: classification.variant ?? null,
    sourceLanguage: classification.sourceLanguage ?? null,
    timeComplexity: classification.metadata.timeComplexity,
    spaceComplexity: classification.metadata.spaceComplexity,
    confidence: classification.confidence,
    sourceCoverage: context.coverage,
    sourceEvidence,
  }
  return {
    ...classification,
    sourceCoverage: context.coverage,
    sourceEvidence,
    reviewReasons: [...reasons],
    needsReview: Boolean(classification.needsReview) || reasons.size > 0,
    proposalHistory: [version],
  }
}

/** Global summaries propose, detailed source revises. Never overwrite detailed
 * metadata/path with a short preliminary summary, even when its score is higher. */
export function reconcileGlobalClassification(
  detail: TemplateClassification,
  fact: BatchTemplateClassificationFact,
  source: string,
  context: ClassificationSourceContext,
): TemplateClassification {
  const global: ClassificationProposalVersion = {
    version: 1,
    source: 'global-summary',
    categoryId: fact.categoryId ?? null,
    categoryPath: fact.categoryPath ?? [],
    algorithmFamily: fact.algorithmFamily ?? '',
    primaryTechnique: fact.primaryTechnique ?? '',
    variant: fact.variant ?? null,
    sourceLanguage: fact.sourceLanguage ?? null,
    timeComplexity: fact.timeComplexity ?? fact.complexitySignals?.time ?? null,
    spaceComplexity: fact.spaceComplexity ?? fact.complexitySignals?.space ?? null,
    confidence: fact.confidence,
    sourceCoverage: context.coverage,
    sourceEvidence: validateSourceEvidence(source, context, fact.sourceEvidence),
  }
  const detailed = detail.proposalHistory?.at(-1)
  const reasons = new Set(detail.reviewReasons ?? [])
  const textConflict = (left: string | null | undefined, right: string | null | undefined) =>
    Boolean(
      left?.trim() &&
      right?.trim() &&
      normalizeTaxonomyAlias(left) !== normalizeTaxonomyAlias(right),
    )
  if (
    detailed &&
    (textConflict(global.categoryId, detailed.categoryId) ||
      (!global.categoryId &&
        global.categoryPath.length > 0 &&
        global.categoryPath.join('/') !== detailed.categoryPath.join('/')) ||
      textConflict(global.algorithmFamily, detailed.algorithmFamily) ||
      textConflict(global.primaryTechnique, detailed.primaryTechnique) ||
      textConflict(global.variant, detailed.variant) ||
      textConflict(global.sourceLanguage, detailed.sourceLanguage) ||
      textConflict(global.timeComplexity, detailed.timeComplexity) ||
      textConflict(global.spaceComplexity, detailed.spaceComplexity) ||
      fact.categoryDecision === 'propose-new' ||
      fact.newCategoryProposal)
  )
    reasons.add('global-detail-disagreement')
  if (!context.coverage.complete) reasons.add('partial-global-coverage')
  if (
    !global.sourceEvidence.some(item => item.containsImplementation) ||
    global.sourceEvidence.some(item => !item.verified)
  )
    reasons.add('unverified-global-evidence')
  if (fact.independentAlgorithmGoals) reasons.add('composite-algorithm')
  if (fact.categoryId && getCanonicalCategory(fact.categoryId)?.reviewRequired)
    reasons.add('generic-category')
  if (fact.confidence < 0.65) reasons.add('low-global-confidence')
  return {
    ...detail,
    reviewReasons: [...reasons],
    needsReview: Boolean(detail.needsReview) || reasons.size > 0,
    proposalHistory: [global, ...(detailed ? [{ ...detailed, version: 2 }] : [])],
  }
}
