import { z } from 'zod'

import { aiTaskKindSchema } from './ai-provider'

export const aiOutputLanguageSchema = z.enum(['zh-CN', 'en'])
export type AiOutputLanguage = z.infer<typeof aiOutputLanguageSchema>

export const aiRequestPreviewSchema = z
  .object({
    cache: z
      .object({
        eligible: z.boolean(),
        key: z.string().max(240),
        workspaceContextVersion: z.string().max(64),
      })
      .strict(),
    estimatedInputTokens: z.number().int().nonnegative(),
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
    task: aiTaskKindSchema,
    truncated: z.boolean(),
  })
  .strict()
export type AiRequestPreview = z.infer<typeof aiRequestPreviewSchema>
