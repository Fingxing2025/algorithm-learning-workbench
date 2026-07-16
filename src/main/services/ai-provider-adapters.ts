import type { AiProviderCapabilities, AiProviderProtocol } from '@core/contracts/ai-provider'

import { PublicError } from '../errors/public-error'

export interface AdapterProfile {
  baseUrl: string
  capabilities: AiProviderCapabilities
  customHeaders: Record<string, string>
  model: string
  protocol: AiProviderProtocol
  timeoutMs: number
}

export interface AiCompletionImage {
  base64: string
  dataUrl: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export interface AiCompletionRequest {
  cache?: { key: string; stableContext: string }
  disableThinking?: boolean
  images?: AiCompletionImage[]
  jsonSchema?: { name: string; schema: Record<string, unknown> }
  maxOutputTokens: number
  onAttempt?: (attempt: { maxOutputTokens: number }) => void
  signal?: AbortSignal
  system?: string
  text: string
}

export interface AiProviderAdapter {
  complete(
    profile: AdapterProfile,
    apiKey: string | null,
    request: AiCompletionRequest,
  ): Promise<string>
  completeText(profile: AdapterProfile, apiKey: string | null, prompt: string): Promise<string>
}

const MAX_RESPONSE_BYTES = 1024 * 1024

function endpoint(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

async function readResponseBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务响应过大，已停止读取。')
  }
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务响应过大，已停止读取。')
  }
  return text
}

function safeProviderErrorDetail(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as unknown
    const nestedError = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : null
    const candidate = nestedError?.message ?? (isRecord(parsed) ? parsed.message : undefined)
    if (typeof candidate !== 'string') return null
    const normalized = candidate.replace(/\s+/g, ' ').trim()
    if (
      !normalized ||
      normalized.length > 300 ||
      /(api[-_ ]?key|authorization|bearer|secret|sk-[a-z0-9])/i.test(normalized)
    ) {
      return null
    }
    return normalized
  } catch {
    return null
  }
}

function parseServerSentEvents(text: string): unknown {
  const payloads = text
    .split(/\r?\n\r?\n/)
    .map(block =>
      block
        .split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice('data:'.length).trimStart())
        .join('\n'),
    )
    .filter(payload => payload && payload !== '[DONE]')

  let finalPayload: unknown
  const deltas: string[] = []

  for (const payload of payloads) {
    try {
      const event = JSON.parse(payload) as unknown
      if (isRecord(event)) {
        if (typeof event.delta === 'string') deltas.push(event.delta)
        const choice = Array.isArray(event.choices) ? event.choices[0] : undefined
        if (isRecord(choice) && isRecord(choice.delta)) {
          deltas.push(extractTextBlocks(choice.delta.content).join('\n'))
        }
        finalPayload = isRecord(event.response) ? event.response : event
      } else {
        finalPayload = event
      }
    } catch {
      // Ignore malformed keep-alive frames. A valid final payload is still required below.
    }
  }

  if (!finalPayload && deltas.length === 0) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务返回了无法识别的流式响应。')
  }
  if (deltas.length === 0) return finalPayload
  return {
    ...(isRecord(finalPayload) ? finalPayload : {}),
    output_text: deltas.join(''),
  }
}

function parseResponsePayload(text: string, contentType: string | null): unknown {
  if (contentType?.includes('text/event-stream') || /^\s*(?:event:|data:)/m.test(text)) {
    return parseServerSentEvents(text)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务返回了无法识别的响应格式。')
  }
}

async function requestJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const signal = externalSignal
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal
  let response: Response
  try {
    response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
      method: 'POST',
      redirect: 'error',
      signal,
    })
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new PublicError('AI_CANCELLED', 'AI 请求已取消。')
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PublicError('AI_TIMEOUT', 'AI 请求超时，请检查接口地址或增大超时时间。')
    }
    throw new PublicError('AI_NETWORK_ERROR', '无法连接 AI 服务，请检查接口地址和网络。')
  } finally {
    clearTimeout(timer)
  }

  if (response.status === 401 || response.status === 403) {
    throw new PublicError('AI_AUTH_FAILED', '鉴权失败，请检查 API Key 和自定义请求头。')
  }
  if (response.status === 404) {
    throw new PublicError('AI_MODEL_NOT_FOUND', '接口或模型不存在，请核对 Base URL 和模型名称。')
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get('retry-after')
    const seconds = retryAfter ? Number(retryAfter) : Number.NaN
    const retryAfterMs = Number.isFinite(seconds)
      ? Math.max(0, seconds * 1_000)
      : retryAfter
        ? Math.max(0, Date.parse(retryAfter) - Date.now())
        : undefined
    throw new PublicError('AI_RATE_LIMITED', '请求受到限流，请稍后重试或更换模型。', retryAfterMs)
  }
  if (response.status === 400) {
    const detail = await readResponseBody(response)
      .then(safeProviderErrorDetail)
      .catch(() => null)
    throw new PublicError(
      'AI_INVALID_RESPONSE',
      detail
        ? `AI 服务拒绝了请求（HTTP 400）：${detail}`
        : 'AI 服务拒绝了请求（HTTP 400）。请检查模型是否支持当前协议和请求参数。',
    )
  }
  if (!response.ok) {
    throw new PublicError('AI_NETWORK_ERROR', `AI 服务暂不可用（HTTP ${response.status}）。`)
  }

  const text = await readResponseBody(response)
  return parseResponsePayload(text, response.headers.get('content-type'))
}

function requireApiKey(apiKey: string | null): string {
  if (!apiKey) {
    throw new PublicError('AI_SECRET_REQUIRED', '该 Provider 尚未保存 API Key。')
  }
  return apiKey
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toOpenAiStrictJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toOpenAiStrictJsonSchema)
  if (!isRecord(value)) return value

  const normalized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$schema')
      .map(([key, nested]) => [key, toOpenAiStrictJsonSchema(nested)]),
  )
  if (isRecord(value.properties)) {
    normalized.required = Object.keys(value.properties)
    normalized.additionalProperties = false
  }
  return normalized
}

function extractTextBlocks(value: unknown, depth = 0): string[] {
  if (depth > 4) return []
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap(item => extractTextBlocks(item, depth + 1))
  if (!isRecord(value)) return []

  for (const key of ['text', 'output_text', 'content']) {
    if (!(key in value)) continue
    const blocks = extractTextBlocks(value[key], depth + 1)
    if (blocks.length > 0) return blocks
  }
  for (const key of ['message', 'delta', 'choices', 'output', 'result', 'data']) {
    if (!(key in value)) continue
    const blocks = extractTextBlocks(value[key], depth + 1)
    if (blocks.length > 0) return blocks
  }
  if (typeof value.reasoning_content === 'string') {
    return extractTextBlocks(value.reasoning_content, depth + 1)
  }
  return []
}

function requireText(...values: unknown[]): string {
  for (const value of values) {
    const text = extractTextBlocks(value).join('\n').trim()
    if (text) return text
  }
  throw new PublicError(
    'AI_INVALID_RESPONSE',
    'AI 服务没有返回可读取的正文。若使用推理模型，请增大输出长度或改用支持 JSON 输出的非推理模型；也请核对补全协议。',
  )
}

function withTextMethod(adapter: Omit<AiProviderAdapter, 'completeText'>): AiProviderAdapter {
  return {
    ...adapter,
    completeText: (profile, apiKey, prompt) =>
      adapter.complete(profile, apiKey, { maxOutputTokens: 256, text: prompt }),
  }
}

const adapters: Record<AiProviderProtocol, AiProviderAdapter> = {
  'openai-chat-completions': withTextMethod({
    async complete(profile, apiKey, request) {
      const images = request.images ?? []
      const userContent =
        images.length === 0
          ? request.text
          : [
              { text: request.text, type: 'text' },
              ...images.map(image => ({
                image_url: { url: image.dataUrl },
                type: 'image_url',
              })),
            ]
      const messages = [
        ...(request.system ? [{ content: request.system, role: 'system' }] : []),
        ...(request.cache?.stableContext
          ? [{ content: request.cache.stableContext, role: 'user' }]
          : []),
        { content: userContent, role: 'user' },
      ]
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'chat/completions'),
        {
          max_tokens: request.maxOutputTokens,
          messages,
          model: profile.model,
          ...(request.disableThinking && /^qwen(?:\d|[-_.])/iu.test(profile.model)
            ? { enable_thinking: false }
            : {}),
          ...(profile.capabilities.promptCaching && request.cache
            ? { prompt_cache_key: request.cache.key }
            : {}),
          ...(profile.capabilities.structuredOutput && request.jsonSchema
            ? {
                response_format: {
                  json_schema: {
                    name: request.jsonSchema.name,
                    schema: toOpenAiStrictJsonSchema(request.jsonSchema.schema),
                    strict: true,
                  },
                  type: 'json_schema',
                },
              }
            : {}),
        },
        { ...profile.customHeaders, authorization: `Bearer ${requireApiKey(apiKey)}` },
        profile.timeoutMs,
        request.signal,
      )) as {
        choices?: Array<{
          message?: { content?: unknown; reasoning_content?: unknown }
          text?: unknown
        }>
        output?: unknown
        output_text?: unknown
        result?: unknown
      }
      return requireText(
        data.choices?.[0]?.message?.content,
        data.choices?.[0]?.text,
        data.output_text,
        data.output,
        data.result,
        data.choices?.[0]?.message?.reasoning_content,
      )
    },
  }),
  'openai-responses': withTextMethod({
    async complete(profile, apiKey, request) {
      const images = request.images ?? []
      const input = [
        ...(request.cache?.stableContext
          ? [
              {
                content: [{ text: request.cache.stableContext, type: 'input_text' }],
                role: 'user',
              },
            ]
          : []),
        {
          content: [
            { text: request.text, type: 'input_text' },
            ...images.map(image => ({ image_url: image.dataUrl, type: 'input_image' })),
          ],
          role: 'user',
        },
      ]
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'responses'),
        {
          ...(request.system ? { instructions: request.system } : {}),
          input,
          max_output_tokens: request.maxOutputTokens,
          model: profile.model,
          ...(profile.capabilities.promptCaching && request.cache
            ? { prompt_cache_key: request.cache.key }
            : {}),
          stream: true,
          ...(profile.capabilities.structuredOutput && request.jsonSchema
            ? {
                text: {
                  format: {
                    name: request.jsonSchema.name,
                    schema: toOpenAiStrictJsonSchema(request.jsonSchema.schema),
                    strict: true,
                    type: 'json_schema',
                  },
                },
              }
            : {}),
        },
        { ...profile.customHeaders, authorization: `Bearer ${requireApiKey(apiKey)}` },
        profile.timeoutMs,
        request.signal,
      )) as {
        choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
        output?: Array<{ content?: unknown }>
        output_text?: unknown
      }
      return requireText(
        data.output_text,
        data.output?.map(item => item.content),
        data.choices?.[0]?.message?.content,
        data.choices?.[0]?.text,
      )
    },
  }),
  'anthropic-messages': withTextMethod({
    async complete(profile, apiKey, request) {
      const content = [
        { text: request.text, type: 'text' },
        ...(request.images ?? []).map(image => ({
          source: { data: image.base64, media_type: image.mediaType, type: 'base64' },
          type: 'image',
        })),
      ]
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'messages'),
        {
          max_tokens: request.maxOutputTokens,
          messages: [{ content, role: 'user' }],
          model: profile.model,
          ...(request.system || request.cache?.stableContext
            ? {
                system: [
                  ...(request.system ? [{ text: request.system, type: 'text' }] : []),
                  ...(request.cache?.stableContext
                    ? [
                        {
                          ...(profile.capabilities.promptCaching
                            ? { cache_control: { type: 'ephemeral' } }
                            : {}),
                          text: request.cache.stableContext,
                          type: 'text',
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
        {
          ...profile.customHeaders,
          'anthropic-version': '2023-06-01',
          'x-api-key': requireApiKey(apiKey),
        },
        profile.timeoutMs,
        request.signal,
      )) as { content?: unknown }
      return requireText(data.content)
    },
  }),
  'gemini-generate-content': withTextMethod({
    async complete(profile, apiKey, request) {
      const model = profile.model.replace(/^models\//, '')
      const parts = [
        ...(request.cache?.stableContext ? [{ text: request.cache.stableContext }] : []),
        { text: request.text },
        ...(request.images ?? []).map(image => ({
          inlineData: { data: image.base64, mimeType: image.mediaType },
        })),
      ]
      const data = (await requestJson(
        endpoint(profile.baseUrl, `models/${encodeURIComponent(model)}:generateContent`),
        {
          contents: [{ parts, role: 'user' }],
          generationConfig: {
            maxOutputTokens: request.maxOutputTokens,
            ...(profile.capabilities.structuredOutput && request.jsonSchema
              ? { responseMimeType: 'application/json', responseSchema: request.jsonSchema.schema }
              : {}),
          },
          ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        },
        { ...profile.customHeaders, 'x-goog-api-key': requireApiKey(apiKey) },
        profile.timeoutMs,
        request.signal,
      )) as { candidates?: Array<{ content?: { parts?: unknown } }> }
      return requireText(data.candidates?.[0]?.content?.parts)
    },
  }),
  'ollama-chat': withTextMethod({
    async complete(profile, _apiKey, request) {
      const messages = [
        ...(request.system ? [{ content: request.system, role: 'system' }] : []),
        ...(request.cache?.stableContext
          ? [{ content: request.cache.stableContext, role: 'user' }]
          : []),
        {
          content: request.text,
          ...(request.images?.length ? { images: request.images.map(image => image.base64) } : {}),
          role: 'user',
        },
      ]
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'api/chat'),
        {
          ...(profile.capabilities.structuredOutput && request.jsonSchema
            ? { format: request.jsonSchema.schema }
            : {}),
          messages,
          model: profile.model,
          stream: false,
        },
        profile.customHeaders,
        profile.timeoutMs,
        request.signal,
      )) as {
        choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
        message?: { content?: unknown }
        response?: unknown
      }
      return requireText(
        data.message?.content,
        data.response,
        data.choices?.[0]?.message?.content,
        data.choices?.[0]?.text,
      )
    },
  }),
}

export function getAiProviderAdapter(protocol: AiProviderProtocol): AiProviderAdapter {
  return adapters[protocol]
}
