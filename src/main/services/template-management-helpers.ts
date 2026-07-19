import {
  type TemplateMetadata,
  type TemplateMetadataFields,
} from '@core/contracts/template-management'

import { PublicError } from '../errors/public-error'
import { normalizeTemplateRelativePath } from '../security/template-path'

export function metadataFields(metadata: TemplateMetadata | null): TemplateMetadataFields {
  return {
    commonMistakes: metadata?.commonMistakes ?? '',
    constraints: metadata?.constraints ?? '',
    notes: metadata?.notes ?? '',
    prerequisites: metadata?.prerequisites ?? '',
    solves: metadata?.solves ?? '',
    spaceComplexity: metadata?.spaceComplexity ?? null,
    tags: metadata?.tags ?? [],
    timeComplexity: metadata?.timeComplexity ?? null,
  }
}

export function buildClassificationPath(categoryPath: string[], fileName: string): string {
  const safeCategories = categoryPath.map(segment => segment.trim().normalize('NFC'))
  const safeFileName = fileName.trim().normalize('NFC')
  if (
    safeCategories.some(
      segment => !segment || segment === '.' || segment === '..' || /[\\/\0]/.test(segment),
    ) ||
    !safeFileName ||
    safeFileName === '.' ||
    safeFileName === '..' ||
    /[\\/\0]/.test(safeFileName)
  ) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 返回的分类或文件名包含无效路径字符。')
  }
  return normalizeTemplateRelativePath([...safeCategories, safeFileName].join('/'))
}

export function normalizeAiDirectoryPath(value: string, allowEmpty = false): string | null {
  const normalized = value.trim().replace(/\\/g, '/').normalize('NFC')
  if (!normalized) return allowEmpty ? '' : null
  if (normalized.length > 4096 || normalized.startsWith('/') || normalized.endsWith('/'))
    return null
  const segments = normalized.split('/')
  if (
    segments.some(
      segment =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        segment.includes('\0') ||
        segment.length > 255,
    )
  ) {
    return null
  }
  return segments.join('/')
}
