import type { AiProviderProtocol } from '@core/contracts/ai-provider'

import { PublicError } from '../errors/public-error'

export interface AdapterProfile {
  baseUrl: string
  customHeaders: Record<string, string>
  model: string
  protocol: AiProviderProtocol
  timeoutMs: number
}

export interface AiProviderAdapter {
  completeText(profile: AdapterProfile, apiKey: string | null, prompt: string): Promise<string>
}

const MAX_RESPONSE_BYTES = 1024 * 1024

function endpoint(baseUrl: string, relativePath: string): string {
  return new URL(relativePath, `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

async function requestJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch(url, {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
      method: 'POST',
      redirect: 'error',
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PublicError('AI_TIMEOUT', '连接测试超时，请检查接口地址或增大超时时间。')
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
    throw new PublicError('AI_RATE_LIMITED', '请求受到限流，请稍后重试或更换模型。')
  }
  if (!response.ok) {
    throw new PublicError('AI_NETWORK_ERROR', `AI 服务暂不可用（HTTP ${response.status}）。`)
  }

  const declaredLength = Number(response.headers.get('content-length') ?? '0')
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务响应过大，已停止读取。')
  }
  const text = await response.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务响应过大，已停止读取。')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务返回了无法识别的响应格式。')
  }
}

function requireApiKey(apiKey: string | null): string {
  if (!apiKey) {
    throw new PublicError('AI_SECRET_REQUIRED', '该 Provider 尚未保存 API Key。')
  }
  return apiKey
}

function requireText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PublicError('AI_INVALID_RESPONSE', 'AI 服务没有返回可读取的文本。')
  }
  return value.trim()
}

const adapters: Record<AiProviderProtocol, AiProviderAdapter> = {
  'openai-chat-completions': {
    async completeText(profile, apiKey, prompt) {
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'chat/completions'),
        { messages: [{ content: prompt, role: 'user' }], model: profile.model },
        { ...profile.customHeaders, authorization: `Bearer ${requireApiKey(apiKey)}` },
        profile.timeoutMs,
      )) as { choices?: Array<{ message?: { content?: unknown } }> }
      return requireText(data.choices?.[0]?.message?.content)
    },
  },
  'openai-responses': {
    async completeText(profile, apiKey, prompt) {
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'responses'),
        { input: prompt, model: profile.model },
        { ...profile.customHeaders, authorization: `Bearer ${requireApiKey(apiKey)}` },
        profile.timeoutMs,
      )) as {
        output?: Array<{ content?: Array<{ text?: unknown; type?: string }> }>
        output_text?: unknown
      }
      if (typeof data.output_text === 'string') return requireText(data.output_text)
      return requireText(
        data.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')
          ?.text,
      )
    },
  },
  'anthropic-messages': {
    async completeText(profile, apiKey, prompt) {
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'messages'),
        {
          max_tokens: 32,
          messages: [{ content: prompt, role: 'user' }],
          model: profile.model,
        },
        {
          ...profile.customHeaders,
          'anthropic-version': '2023-06-01',
          'x-api-key': requireApiKey(apiKey),
        },
        profile.timeoutMs,
      )) as { content?: Array<{ text?: unknown; type?: string }> }
      return requireText(data.content?.find(item => item.type === 'text')?.text)
    },
  },
  'gemini-generate-content': {
    async completeText(profile, apiKey, prompt) {
      const model = profile.model.replace(/^models\//, '')
      const data = (await requestJson(
        endpoint(profile.baseUrl, `models/${encodeURIComponent(model)}:generateContent`),
        { contents: [{ parts: [{ text: prompt }], role: 'user' }] },
        { ...profile.customHeaders, 'x-goog-api-key': requireApiKey(apiKey) },
        profile.timeoutMs,
      )) as { candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }> }
      return requireText(data.candidates?.[0]?.content?.parts?.[0]?.text)
    },
  },
  'ollama-chat': {
    async completeText(profile, _apiKey, prompt) {
      const data = (await requestJson(
        endpoint(profile.baseUrl, 'api/chat'),
        { messages: [{ content: prompt, role: 'user' }], model: profile.model, stream: false },
        profile.customHeaders,
        profile.timeoutMs,
      )) as { message?: { content?: unknown } }
      return requireText(data.message?.content)
    },
  },
}

export function getAiProviderAdapter(protocol: AiProviderProtocol): AiProviderAdapter {
  return adapters[protocol]
}
