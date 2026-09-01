import type {
  TemplateClassification,
  TemplateMetadataFields,
} from '@core/contracts/template-management'

export type TemplateMergeKey = keyof TemplateMetadataFields | 'relativePath'
export type TemplateMergeChoice = 'ai' | 'user'

export interface TemplateMetadataConflict {
  aiValue: string
  key: TemplateMergeKey
  label: string
  userValue: string
}

export interface TemplateDraftSnapshot {
  metadata: TemplateMetadataFields
  relativePath: string
}

export const emptyTemplateMetadata: TemplateMetadataFields = {
  notes: '',
  solves: '',
  spaceComplexity: null,
  tags: [],
  timeComplexity: null,
}

const fieldLabels: Record<TemplateMergeKey, string> = {
  notes: '用户笔记',
  relativePath: '保存路径',
  solves: '解决的问题',
  spaceComplexity: '空间复杂度',
  tags: '标签',
  timeComplexity: '时间复杂度',
}

function hasValue(value: TemplateMetadataFields[keyof TemplateMetadataFields] | string): boolean {
  return Array.isArray(value)
    ? value.length > 0
    : typeof value === 'string'
      ? value.trim().length > 0
      : false
}

function comparable(value: TemplateMetadataFields[keyof TemplateMetadataFields] | string): string {
  return Array.isArray(value)
    ? JSON.stringify(value.map(item => item.trim()).filter(Boolean))
    : (value?.trim() ?? '')
}

function displayValue(
  value: TemplateMetadataFields[keyof TemplateMetadataFields] | string,
): string {
  if (Array.isArray(value)) return value.join('、') || '未填写'
  return value?.trim() || '未填写'
}

export function findTemplateMetadataConflicts(
  relativePath: string,
  metadata: TemplateMetadataFields,
  classification: TemplateClassification,
): TemplateMetadataConflict[] {
  const conflicts: TemplateMetadataConflict[] = []
  const compare = (
    key: TemplateMergeKey,
    userValue: TemplateMetadataFields[keyof TemplateMetadataFields] | string,
    aiValue: TemplateMetadataFields[keyof TemplateMetadataFields] | string,
  ) => {
    if (hasValue(userValue) && hasValue(aiValue) && comparable(userValue) !== comparable(aiValue)) {
      conflicts.push({
        aiValue: displayValue(aiValue),
        key,
        label: fieldLabels[key],
        userValue: displayValue(userValue),
      })
    }
  }

  compare('relativePath', relativePath, classification.suggestedRelativePath)
  for (const key of Object.keys(metadata) as Array<keyof TemplateMetadataFields>) {
    compare(key, metadata[key], classification.metadata[key])
  }
  return conflicts
}

export function mergeTemplateClassification(
  relativePath: string,
  metadata: TemplateMetadataFields,
  classification: TemplateClassification,
  choices: Partial<Record<TemplateMergeKey, TemplateMergeChoice>>,
): { metadata: TemplateMetadataFields; relativePath: string } {
  const choose = <Value extends TemplateMetadataFields[keyof TemplateMetadataFields] | string>(
    key: TemplateMergeKey,
    userValue: Value,
    aiValue: Value,
  ): Value => {
    if (!hasValue(userValue)) return aiValue
    if (!hasValue(aiValue) || comparable(userValue) === comparable(aiValue)) return userValue
    return choices[key] === 'ai' ? aiValue : userValue
  }

  return {
    metadata: {
      notes: choose('notes', metadata.notes, classification.metadata.notes),
      solves: choose('solves', metadata.solves, classification.metadata.solves),
      spaceComplexity: choose(
        'spaceComplexity',
        metadata.spaceComplexity,
        classification.metadata.spaceComplexity,
      ),
      tags: choose('tags', metadata.tags, classification.metadata.tags),
      timeComplexity: choose(
        'timeComplexity',
        metadata.timeComplexity,
        classification.metadata.timeComplexity,
      ),
    },
    relativePath: choose('relativePath', relativePath, classification.suggestedRelativePath),
  }
}

export function restoreDraftBeforeClassificationLanguageChange(
  current: TemplateDraftSnapshot,
  baseline: TemplateDraftSnapshot,
  classification: TemplateClassification,
): TemplateDraftSnapshot {
  const restore = <Value extends TemplateMetadataFields[keyof TemplateMetadataFields] | string>(
    currentValue: Value,
    baselineValue: Value,
    aiValue: Value,
  ): Value =>
    hasValue(aiValue) && comparable(currentValue) === comparable(aiValue)
      ? baselineValue
      : currentValue

  return {
    metadata: {
      notes: restore(
        current.metadata.notes,
        baseline.metadata.notes,
        classification.metadata.notes,
      ),
      solves: restore(
        current.metadata.solves,
        baseline.metadata.solves,
        classification.metadata.solves,
      ),
      spaceComplexity: restore(
        current.metadata.spaceComplexity,
        baseline.metadata.spaceComplexity,
        classification.metadata.spaceComplexity,
      ),
      tags: restore(current.metadata.tags, baseline.metadata.tags, classification.metadata.tags),
      timeComplexity: restore(
        current.metadata.timeComplexity,
        baseline.metadata.timeComplexity,
        classification.metadata.timeComplexity,
      ),
    },
    relativePath: restore(
      current.relativePath,
      baseline.relativePath,
      classification.suggestedRelativePath,
    ),
  }
}

export function hasTemplateMetadata(metadata: TemplateMetadataFields): boolean {
  return Object.values(metadata).some(hasValue)
}
