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

export const emptyTemplateMetadata: TemplateMetadataFields = {
  commonMistakes: '',
  constraints: '',
  notes: '',
  prerequisites: '',
  solves: '',
  spaceComplexity: null,
  tags: [],
  timeComplexity: null,
}

const fieldLabels: Record<TemplateMergeKey, string> = {
  commonMistakes: '常见错误',
  constraints: '适用约束',
  notes: '用户笔记',
  prerequisites: '前置条件',
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
      commonMistakes: choose(
        'commonMistakes',
        metadata.commonMistakes,
        classification.metadata.commonMistakes,
      ),
      constraints: choose('constraints', metadata.constraints, classification.metadata.constraints),
      notes: choose('notes', metadata.notes, classification.metadata.notes),
      prerequisites: choose(
        'prerequisites',
        metadata.prerequisites,
        classification.metadata.prerequisites,
      ),
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

export function hasTemplateMetadata(metadata: TemplateMetadataFields): boolean {
  return Object.values(metadata).some(hasValue)
}
