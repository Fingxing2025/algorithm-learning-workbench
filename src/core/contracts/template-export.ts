import { z } from 'zod'

const templateIdSchema = z.string().regex(/^[a-f0-9]{64}$/)

export const templateExportRequestSchema = z
  .object({
    compilePdf: z.boolean().default(false),
    generateDoc: z.boolean().default(false),
    includeMetadata: z.boolean().default(false),
    requestId: z.string().uuid().optional(),
    templateIds: z
      .array(templateIdSchema)
      .min(1)
      .max(100)
      .refine(ids => new Set(ids).size === ids.length, '模板 ID 不能重复。'),
  })
  .strict()

export type TemplateExportRequest = z.infer<typeof templateExportRequestSchema>

export const templateExportResultSchema = z
  .object({
    compileMessage: z.string().max(500),
    docFileName: z.string().max(255).nullable(),
    docStatus: z.enum(['not-requested', 'generated', 'failed']),
    generatedFileCount: z.number().int().nonnegative(),
    pdfFileName: z.string().max(255).nullable(),
    pdfStatus: z.enum(['not-requested', 'generated', 'unavailable', 'failed']),
    resourceDirectoryName: z.string().min(1).max(255),
    templateCount: z.number().int().positive().max(100),
    texBytes: z.number().int().positive(),
    texFileName: z.string().min(1).max(255),
  })
  .strict()

export type TemplateExportResult = z.infer<typeof templateExportResultSchema>

export const cancelTemplateExportRequestSchema = z.object({ requestId: z.string().uuid() }).strict()
export type CancelTemplateExportRequest = z.infer<typeof cancelTemplateExportRequestSchema>
