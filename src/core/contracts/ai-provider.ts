import { z } from 'zod'

export const aiProviderProtocolSchema = z.enum([
  'openai-chat-completions',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'ollama-chat',
])
export type AiProviderProtocol = z.infer<typeof aiProviderProtocolSchema>

export const aiProviderCapabilitiesSchema = z.object({
  streaming: z.boolean(),
  structuredOutput: z.boolean(),
  vision: z.boolean(),
})
export type AiProviderCapabilities = z.infer<typeof aiProviderCapabilitiesSchema>

const customHeadersSchema = z
  .record(z.string().min(1).max(80), z.string().max(500))
  .refine(headers => Object.keys(headers).length <= 12, '自定义请求头不能超过 12 项。')

const baseProfileFields = {
  baseUrl: z.string().trim().min(1).max(500),
  capabilities: aiProviderCapabilitiesSchema,
  customHeaders: customHeadersSchema,
  model: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(80),
  protocol: aiProviderProtocolSchema,
  timeoutMs: z.number().int().min(3_000).max(120_000),
}

export const createAiProviderRequestSchema = z.object({
  ...baseProfileFields,
  apiKey: z.string().max(20_000).optional(),
})
export type CreateAiProviderRequest = z.infer<typeof createAiProviderRequestSchema>

export const updateAiProviderRequestSchema = z.object({
  ...baseProfileFields,
  apiKey: z.string().max(20_000).optional(),
  clearApiKey: z.boolean().default(false),
  id: z.string().uuid(),
})
export type UpdateAiProviderRequest = z.infer<typeof updateAiProviderRequestSchema>

export const aiProviderProfileSchema = z.object({
  ...baseProfileFields,
  createdAt: z.string().datetime(),
  hasSecret: z.boolean(),
  id: z.string().uuid(),
  updatedAt: z.string().datetime(),
})
export type AiProviderProfile = z.infer<typeof aiProviderProfileSchema>

export const aiProviderListSchema = aiProviderProfileSchema.array()
export const aiProviderIdRequestSchema = z.object({ id: z.string().uuid() })
export type AiProviderIdRequest = z.infer<typeof aiProviderIdRequestSchema>

export const aiConnectionResultSchema = z.object({
  latencyMs: z.number().int().nonnegative(),
  message: z.string(),
  model: z.string(),
  ok: z.literal(true),
})
export type AiConnectionResult = z.infer<typeof aiConnectionResultSchema>

export const aiTaskKindSchema = z.enum([
  'problem-image-analysis',
  'template-metadata',
  'workspace-management',
])
export type AiTaskKind = z.infer<typeof aiTaskKindSchema>

export const aiTaskRouteSchema = z.object({
  providerId: z.string().uuid(),
  task: aiTaskKindSchema,
  updatedAt: z.string().datetime(),
})
export const aiTaskRouteListSchema = aiTaskRouteSchema.array()
export type AiTaskRoute = z.infer<typeof aiTaskRouteSchema>

export const upsertAiTaskRouteRequestSchema = z.object({
  providerId: z.string().uuid(),
  task: aiTaskKindSchema,
})
export type UpsertAiTaskRouteRequest = z.infer<typeof upsertAiTaskRouteRequestSchema>
