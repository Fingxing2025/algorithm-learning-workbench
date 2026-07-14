import {
  aiProviderCapabilitiesSchema,
  createAiProviderRequestSchema,
  updateAiProviderRequestSchema,
  type AiConnectionResult,
  type AiProviderProfile,
  type AiTaskRoute,
  type CreateAiProviderRequest,
  type UpdateAiProviderRequest,
  type UpsertAiTaskRouteRequest,
} from '@core/contracts/ai-provider'

import { AiProviderRepository, type AiProviderRecord } from '../database/ai-provider-repository'
import { PublicError } from '../errors/public-error'
import { SecretStore } from '../security/secret-store'
import { getAiProviderAdapter, type AiCompletionRequest } from './ai-provider-adapters'

const RESTRICTED_HEADERS = new Set([
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'proxy-authorization',
  'transfer-encoding',
  'x-api-key',
  'x-goog-api-key',
])
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost'])

function validateAndNormalizeBaseUrl(
  baseUrl: string,
  protocol: CreateAiProviderRequest['protocol'],
): string {
  let parsed: URL
  try {
    parsed = new URL(baseUrl)
  } catch {
    throw new PublicError('INVALID_REQUEST', 'Base URL 格式无效。')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new PublicError('INVALID_REQUEST', 'Base URL 不能包含凭据、查询参数或片段。')
  }
  const testLoopbackAllowed =
    process.env.NODE_ENV === 'test' && process.env.E2E_ALLOW_INSECURE_AI_LOOPBACK === '1'
  const isLoopbackHttp = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname)
  const allowed =
    parsed.protocol === 'https:' ||
    (isLoopbackHttp && (protocol === 'ollama-chat' || testLoopbackAllowed))
  if (!allowed) {
    throw new PublicError(
      'INVALID_REQUEST',
      'Base URL 必须使用 HTTPS；Ollama 可使用本机 loopback HTTP。',
    )
  }
  return parsed.toString().replace(/\/+$/, '')
}

function validateHeaders(headers: Record<string, string>): void {
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase()
    if (
      !HEADER_NAME_PATTERN.test(name) ||
      RESTRICTED_HEADERS.has(normalized) ||
      /(authorization|api[-_]?key|token|secret|cookie)/i.test(normalized)
    ) {
      throw new PublicError('INVALID_REQUEST', `不允许自定义请求头“${name}”。`)
    }
    if (/[\r\n]/.test(value)) {
      throw new PublicError('INVALID_REQUEST', '自定义请求头不能包含换行符。')
    }
  }
}

function toAdapterProfile(record: AiProviderRecord) {
  return {
    baseUrl: record.baseUrl,
    capabilities: aiProviderCapabilitiesSchema.parse(JSON.parse(record.capabilitiesJson)),
    customHeaders: JSON.parse(record.customHeadersJson) as Record<string, string>,
    model: record.model,
    protocol: record.protocol as AiProviderProfile['protocol'],
    timeoutMs: record.timeoutMs,
  }
}

export class AiProviderService {
  constructor(
    private readonly repository: AiProviderRepository,
    private readonly secretStore: SecretStore,
  ) {}

  async create(rawRequest: CreateAiProviderRequest): Promise<AiProviderProfile> {
    const request = createAiProviderRequestSchema.parse(rawRequest)
    request.baseUrl = validateAndNormalizeBaseUrl(request.baseUrl, request.protocol)
    validateHeaders(request.customHeaders)
    let secretRef: string | null = null
    try {
      if (request.apiKey?.trim()) secretRef = await this.secretStore.write(request.apiKey)
      return this.repository.create(request, secretRef)
    } catch (error) {
      await this.secretStore.delete(secretRef)
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    const deleted = this.repository.delete(id)
    if (!deleted) throw new PublicError('AI_PROVIDER_NOT_FOUND', 'Provider 不存在或已删除。')
    await this.secretStore.delete(deleted.secretRef)
  }

  list(): AiProviderProfile[] {
    return this.repository.list()
  }

  listRoutes(): AiTaskRoute[] {
    return this.repository.listRoutes()
  }

  async runTask(
    task: AiTaskRoute['task'],
    request: AiCompletionRequest,
  ): Promise<{ model: string; providerName: string; text: string }> {
    const record = this.repository.getProviderForTask(task)
    if (!record) {
      throw new PublicError(
        'AI_ROUTE_REQUIRED',
        '尚未为此任务选择 AI Provider，请先前往 AI 管理设置任务路由。',
      )
    }
    const profile = toAdapterProfile(record)
    if (request.images?.length && !profile.capabilities.vision) {
      throw new PublicError('AI_CAPABILITY_UNSUPPORTED', '当前任务模型不支持图片输入。')
    }
    const apiKey = await this.secretStore.read(record.secretRef)
    const text = await getAiProviderAdapter(profile.protocol).complete(profile, apiKey, request)
    return { model: record.model, providerName: record.name, text }
  }

  async testConnection(id: string): Promise<AiConnectionResult> {
    const record = this.repository.getRecord(id)
    if (!record) throw new PublicError('AI_PROVIDER_NOT_FOUND', 'Provider 不存在或已删除。')
    const apiKey = await this.secretStore.read(record.secretRef)
    const startedAt = Date.now()
    await getAiProviderAdapter(record.protocol as AiProviderProfile['protocol']).completeText(
      toAdapterProfile(record),
      apiKey,
      'Reply with OK only.',
    )
    return {
      latencyMs: Date.now() - startedAt,
      message: '连接成功，模型返回了有效文本。',
      model: record.model,
      ok: true,
    }
  }

  async update(rawRequest: UpdateAiProviderRequest): Promise<AiProviderProfile> {
    const request = updateAiProviderRequestSchema.parse(rawRequest)
    request.baseUrl = validateAndNormalizeBaseUrl(request.baseUrl, request.protocol)
    validateHeaders(request.customHeaders)
    const existing = this.repository.getRecord(request.id)
    if (!existing) throw new PublicError('AI_PROVIDER_NOT_FOUND', 'Provider 不存在或已删除。')

    let nextSecretRef = request.clearApiKey ? null : existing.secretRef
    let createdSecretRef: string | null = null
    try {
      if (request.apiKey?.trim()) {
        createdSecretRef = await this.secretStore.write(request.apiKey)
        nextSecretRef = createdSecretRef
      }
      const updated = this.repository.update(request, nextSecretRef)
      if (!updated) throw new PublicError('AI_PROVIDER_NOT_FOUND', 'Provider 不存在或已删除。')
      if (existing.secretRef !== nextSecretRef) await this.secretStore.delete(existing.secretRef)
      return updated
    } catch (error) {
      await this.secretStore.delete(createdSecretRef)
      throw error
    }
  }

  upsertRoute(request: UpsertAiTaskRouteRequest): AiTaskRoute {
    const provider = this.repository.getRecord(request.providerId)
    if (!provider) throw new PublicError('AI_PROVIDER_NOT_FOUND', 'Provider 不存在或已删除。')
    if (request.task === 'problem-image-analysis') {
      const capabilities = JSON.parse(provider.capabilitiesJson) as { vision?: boolean }
      if (!capabilities.vision) {
        throw new PublicError('AI_CAPABILITY_UNSUPPORTED', '题目图片分析必须选择支持视觉的模型。')
      }
    }
    return this.repository.upsertRoute(request.task, request.providerId)
  }
}
