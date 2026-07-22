import { z } from 'zod'

import {
  aiProviderCapabilitiesSchema,
  aiProviderProtocolSchema,
  aiTaskKindSchema,
} from './ai-provider'

export const aiOutputLanguageSchema = z.enum(['zh-CN', 'en'])
export type AiOutputLanguage = z.infer<typeof aiOutputLanguageSchema>

export const aiRequestIdSchema = z.string().uuid()
export const cancelAiRequestSchema = z.object({ requestId: aiRequestIdSchema }).strict()
export type CancelAiRequest = z.infer<typeof cancelAiRequestSchema>

export const workspaceCatalogPreviewSchema = z
  .object({
    directoryCount: z.number().int().nonnegative(),
    estimatedInputTokens: z.number().int().nonnegative(),
    relatedSourceCharacters: z.number().int().nonnegative(),
    relatedSourceTemplateCount: z.number().int().nonnegative(),
    schemaVersion: z.literal(1),
    sentTemplateNameCount: z.number().int().nonnegative(),
    sourceSnippetsOmitted: z.boolean(),
    summarizedTemplateCount: z.number().int().nonnegative(),
    summaryShortened: z.boolean(),
    supplementalMetadataOmitted: z.boolean(),
    templateCount: z.number().int().nonnegative().max(300),
    templateNamesTruncated: z.boolean(),
  })
  .strict()
export type WorkspaceCatalogPreview = z.infer<typeof workspaceCatalogPreviewSchema>

export const aiRequestPreviewSchema = z
  .object({
    capabilities: aiProviderCapabilitiesSchema,
    cache: z
      .object({
        eligible: z.boolean(),
        key: z.string().max(240),
        workspaceContextVersion: z.string().max(64),
      })
      .strict(),
    estimatedInputTokens: z.number().int().nonnegative(),
    endpointHost: z.string().min(1).max(255),
    items: z
      .array(
        z
          .object({
            detail: z.string().max(500),
            kind: z.enum(['content', 'image', 'workspace', 'excluded']),
            label: z.string().max(120),
          })
          .strict(),
      )
      .max(30),
    model: z.string().min(1).max(160),
    outputLanguage: aiOutputLanguageSchema,
    providerName: z.string().min(1).max(80),
    protocol: aiProviderProtocolSchema,
    task: aiTaskKindSchema,
    truncated: z.boolean(),
    workspaceCatalog: workspaceCatalogPreviewSchema.optional(),
  })
  .strict()
export type AiRequestPreview = z.infer<typeof aiRequestPreviewSchema>
