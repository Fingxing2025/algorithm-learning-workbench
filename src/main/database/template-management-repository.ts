import { eq } from 'drizzle-orm'

import {
  templateMetadataFieldsSchema,
  type TemplateMetadata,
  type TemplateMetadataFields,
} from '@core/contracts/template-management'

import type { AppDatabase } from './database'
import { templateMetadata } from './schema'

function parseTags(value: string): string[] {
  try {
    const parsed = templateMetadataFieldsSchema.shape.tags.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch {
    return []
  }
}

export class TemplateManagementRepository {
  constructor(private readonly database: AppDatabase) {}

  getMetadata(templateId: string): TemplateMetadata | null {
    const record = this.database.orm
      .select()
      .from(templateMetadata)
      .where(eq(templateMetadata.templateId, templateId))
      .get()
    if (!record) return null
    return {
      commonMistakes: record.commonMistakes,
      constraints: record.constraints,
      notes: record.notes,
      prerequisites: record.prerequisites,
      solves: record.solves,
      spaceComplexity: record.spaceComplexity,
      tags: parseTags(record.tagsJson),
      templateId: record.templateId,
      timeComplexity: record.timeComplexity,
      updatedAt: record.updatedAt,
    }
  }

  hasMetadata(templateId: string): boolean {
    return Boolean(
      this.database.orm
        .select({ templateId: templateMetadata.templateId })
        .from(templateMetadata)
        .where(eq(templateMetadata.templateId, templateId))
        .get(),
    )
  }

  upsertMetadata(templateId: string, fields: TemplateMetadataFields): TemplateMetadata {
    const updatedAt = new Date().toISOString()
    this.database.orm
      .insert(templateMetadata)
      .values({
        ...fields,
        tagsJson: JSON.stringify(fields.tags),
        templateId,
        updatedAt,
      })
      .onConflictDoUpdate({
        set: {
          ...fields,
          tagsJson: JSON.stringify(fields.tags),
          updatedAt,
        },
        target: templateMetadata.templateId,
      })
      .run()
    return this.getMetadata(templateId)!
  }
}
