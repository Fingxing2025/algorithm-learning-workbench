import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import type { AiProviderProtocol } from '@core/contracts/ai-provider'

import type { AiProviderRepository, AiProviderRecord } from '../database/ai-provider-repository'
import type { SecretStore } from '../security/secret-store'
import { getAiProviderAdapter, type AdapterProfile } from './ai-provider-adapters'
import { AiProviderService } from './ai-provider-service'
import { runStructuredAiTask } from './structured-ai-task'

const protocols = [
  'openai-chat-completions',
  'openai-responses',
  'anthropic-messages',
  'gemini-generate-content',
  'ollama-chat',
] as const satisfies readonly AiProviderProtocol[]

function profile(protocol: AiProviderProtocol, timeoutMs = 3_000): AdapterProfile {
  return {
    baseUrl: protocol === 'ollama-chat' ? 'http://localhost:11434' : 'https://provider.example/v1',
    capabilities: {
      promptCaching: false,
      streaming: protocol === 'openai-responses',
      structuredOutput: true,
      vision: true,
    },
    customHeaders: {},
    model: 'fixture-model',
    protocol,
    timeoutMs,
  }
}

function apiKey(protocol: AiProviderProtocol): string | null {
  return protocol === 'ollama-chat' ? null : 'fixture-secret'
}

function successResponse(protocol: AiProviderProtocol, text: string): Response {
  const payload =
    protocol === 'openai-chat-completions'
      ? { choices: [{ message: { content: text } }] }
      : protocol === 'openai-responses'
        ? { output_text: text }
        : protocol === 'anthropic-messages'
          ? { content: [{ text, type: 'text' }] }
          : protocol === 'gemini-generate-content'
            ? { candidates: [{ content: { parts: [{ text }] } }] }
            : { message: { content: text } }
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  })
}

async function complete(protocol: AiProviderProtocol, jsonSchema = false): Promise<string> {
  return getAiProviderAdapter(protocol).complete(profile(protocol), apiKey(protocol), {
    ...(jsonSchema
      ? {
          jsonSchema: {
            name: 'fixture_result',
            schema: {
              additionalProperties: false,
              properties: { ok: { type: 'boolean' } },
              required: ['ok'],
              type: 'object',
            },
          },
        }
      : {}),
    maxOutputTokens: 256,
    text: 'Synthetic fixture input.',
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe.each(protocols)('%s compatibility contract', protocol => {
  it('extracts a successful text response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => successResponse(protocol, 'fixture-text')),
    )
    await expect(complete(protocol)).resolves.toBe('fixture-text')
  })

  it('extracts structured JSON text', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => successResponse(protocol, '{"ok":true}')),
    )
    await expect(complete(protocol, true)).resolves.toBe('{"ok":true}')
  })

  it('rejects invalid model JSON after the single bounded repair', async () => {
    const fetchMock = vi.fn(async () => successResponse(protocol, 'invalid-json-fixture'))
    vi.stubGlobal('fetch', fetchMock)
    const providerRecord: AiProviderRecord = {
      baseUrl: profile(protocol).baseUrl,
      capabilitiesJson: JSON.stringify(profile(protocol).capabilities),
      createdAt: '2026-07-17T00:00:00.000Z',
      customHeadersJson: '{}',
      id: '10000000-0000-4000-8000-000000000001',
      model: 'fixture-model',
      name: 'Fixture Provider',
      protocol,
      secretRef: protocol === 'ollama-chat' ? null : 'fixture-ref',
      timeoutMs: 3_000,
      updatedAt: '2026-07-17T00:00:00.000Z',
    }
    const repository = {
      getProviderForTask: () => providerRecord,
    } as unknown as AiProviderRepository
    const secretStore = { read: async () => 'fixture-secret' } as unknown as SecretStore
    const service = new AiProviderService(repository, secretStore)
    await expect(
      runStructuredAiTask({
        aiProviderService: service,
        invalidMessage: '输出格式无效，请更换模型后重试。',
        request: { maxOutputTokens: 256, text: 'Synthetic fixture input.' },
        schema: z.object({ ok: z.boolean() }).strict(),
        schemaName: 'fixture_result',
        task: 'template-metadata',
      }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', stage: 'structure-repair' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it.each([401, 403])('classifies HTTP %s as authentication failure', async status => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status })),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_AUTH_FAILED',
      stage: 'request',
    })
  })

  it('classifies a missing model without exposing the response body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"error":{"message":"private fixture model does not exist"}}', {
            status: 404,
          }),
      ),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_MODEL_NOT_FOUND',
      message: expect.not.stringContaining('private fixture'),
    })
  })

  it('preserves Retry-After metadata for HTTP 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { headers: { 'retry-after': '2' }, status: 429 })),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      retryAfterMs: 2_000,
    })
  })

  it('classifies retryable 5xx responses explicitly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 503 })),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_SERVICE_UNAVAILABLE',
    })
  })

  it('distinguishes connection timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const completion = getAiProviderAdapter(protocol).complete(
      profile(protocol, 20),
      apiKey(protocol),
      { maxOutputTokens: 256, text: 'Synthetic fixture input.' },
    )
    const assertion = expect(completion).rejects.toMatchObject({
      code: 'AI_CONNECTION_TIMEOUT',
      stage: 'connection',
    })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it('distinguishes response body timeout', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            init?.signal?.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            )
          },
        })
        return new Response(stream, {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }),
    )
    const completion = getAiProviderAdapter(protocol).complete(
      profile(protocol, 20),
      apiKey(protocol),
      { maxOutputTokens: 256, text: 'Synthetic fixture input.' },
    )
    const assertion = expect(completion).rejects.toMatchObject({
      code: 'AI_RESPONSE_TIMEOUT',
      stage: 'response-read',
    })
    await vi.advanceTimersByTimeAsync(25)
    await assertion
  })

  it('propagates user cancellation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const controller = new AbortController()
    const completion = getAiProviderAdapter(protocol).complete(
      profile(protocol),
      apiKey(protocol),
      {
        maxOutputTokens: 256,
        signal: controller.signal,
        text: 'Synthetic fixture input.',
      },
    )
    controller.abort()
    await expect(completion).rejects.toMatchObject({ code: 'AI_CANCELLED' })
  })

  it('rejects an invalid provider envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('not-json', {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      stage: 'provider-envelope',
    })
  })

  it('stops an oversized response without relying on Content-Length', async () => {
    const oversized = `{"value":"${'x'.repeat(1024 * 1024)}"}`
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(oversized, {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_RESPONSE_TOO_LARGE',
      stage: 'response-read',
    })
  })

  it('rejects a truncated stream without a completion marker', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('event: response.output_text.delta\ndata: {"delta":"partial"}\n\n', {
            headers: { 'content-type': 'text/event-stream' },
            status: 200,
          }),
      ),
    )
    await expect(complete(protocol)).rejects.toMatchObject({
      code: 'AI_STREAM_INTERRUPTED',
      stage: 'stream-read',
    })
  })

  it('uses prompt-only structured output when native support is disabled', async () => {
    let body: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>
        return successResponse(protocol, '{"ok":true}')
      }),
    )
    const disabled = profile(protocol)
    disabled.capabilities.structuredOutput = false
    await getAiProviderAdapter(protocol).complete(disabled, apiKey(protocol), {
      jsonSchema: {
        name: 'fixture_result',
        schema: { properties: { ok: { type: 'boolean' } }, type: 'object' },
      },
      maxOutputTokens: 256,
      text: 'Synthetic fixture input.',
    })
    if (protocol === 'openai-chat-completions') expect(body.response_format).toBeUndefined()
    if (protocol === 'openai-responses') expect(body.text).toBeUndefined()
    if (protocol === 'gemini-generate-content') {
      expect(body.generationConfig).not.toHaveProperty('responseMimeType')
    }
    if (protocol === 'ollama-chat') expect(body.format).toBeUndefined()
  })

  it('blocks unsupported vision before any network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const record: AiProviderRecord = {
      baseUrl: profile(protocol).baseUrl,
      capabilitiesJson: JSON.stringify({
        promptCaching: false,
        streaming: false,
        structuredOutput: true,
        vision: false,
      }),
      createdAt: '2026-07-17T00:00:00.000Z',
      customHeadersJson: '{}',
      id: '10000000-0000-4000-8000-000000000001',
      model: 'fixture-model',
      name: 'Fixture Provider',
      protocol,
      secretRef: protocol === 'ollama-chat' ? null : 'fixture-ref',
      timeoutMs: 3_000,
      updatedAt: '2026-07-17T00:00:00.000Z',
    }
    const repository = { getProviderForTask: () => record } as unknown as AiProviderRepository
    const secretStore = { read: async () => 'fixture-secret' } as unknown as SecretStore
    const service = new AiProviderService(repository, secretStore)
    await expect(
      service.runTask('problem-image-analysis', {
        images: [{ base64: 'AA==', dataUrl: 'data:image/png;base64,AA==', mediaType: 'image/png' }],
        maxOutputTokens: 256,
        text: 'Synthetic fixture input.',
      }),
    ).rejects.toMatchObject({ code: 'AI_CAPABILITY_UNSUPPORTED' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
