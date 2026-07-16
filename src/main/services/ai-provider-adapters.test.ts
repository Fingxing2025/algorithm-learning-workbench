import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiProviderProtocol } from '@core/contracts/ai-provider'

import { getAiProviderAdapter } from './ai-provider-adapters'

function profile(protocol: AiProviderProtocol) {
  return {
    baseUrl: 'https://provider.example/v1',
    capabilities: { promptCaching: false, streaming: true, structuredOutput: true, vision: true },
    customHeaders: { 'x-client-name': 'algorithm-workbench-test' },
    model: 'fixture-model',
    protocol,
    timeoutMs: 3_000,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI provider adapters', () => {
  it('uses the OpenAI Chat Completions contract without leaking the key into the body', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        capturedUrl = url
        capturedInit = init
        return new Response(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }),
    )

    const value = await getAiProviderAdapter('openai-chat-completions').completeText(
      profile('openai-chat-completions'),
      'test-secret',
      'Reply with OK only.',
    )

    expect(value).toBe('OK')
    expect(capturedUrl).toBe('https://provider.example/v1/chat/completions')
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      max_tokens: 256,
      messages: [{ content: 'Reply with OK only.', role: 'user' }],
      model: 'fixture-model',
    })
    expect(capturedInit?.headers).toMatchObject({ authorization: 'Bearer test-secret' })
    expect(String(capturedInit?.body)).not.toContain('test-secret')
  })

  it('reads text blocks and legacy completion fields from OpenAI-compatible services', async () => {
    const responses = [
      { choices: [{ message: { content: [{ text: 'from text block', type: 'text' }] } }] },
      { choices: [{ text: 'from legacy completion' }] },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(responses.shift()), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    )

    const adapter = getAiProviderAdapter('openai-chat-completions')
    await expect(
      adapter.completeText(profile('openai-chat-completions'), 'test-secret', 'Reply'),
    ).resolves.toBe('from text block')
    await expect(
      adapter.completeText(profile('openai-chat-completions'), 'test-secret', 'Reply'),
    ).resolves.toBe('from legacy completion')
  })

  it('disables Qwen thinking for structured tasks and reads nested compatible output', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          JSON.stringify({
            output: {
              choices: [
                {
                  message: {
                    content: null,
                    reasoning_content: '{"categoryPath":["字符串算法","BWT"]}',
                  },
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        )
      }),
    )

    const qwenProfile = profile('openai-chat-completions')
    qwenProfile.model = 'qwen3-vl-plus'
    await expect(
      getAiProviderAdapter('openai-chat-completions').complete(qwenProfile, 'test-secret', {
        disableThinking: true,
        jsonSchema: {
          name: 'template_metadata',
          schema: { properties: { categoryPath: { type: 'array' } }, type: 'object' },
        },
        maxOutputTokens: 4_000,
        text: 'Analyze BWT.',
      }),
    ).resolves.toBe('{"categoryPath":["字符串算法","BWT"]}')
    expect(capturedBody.enable_thinking).toBe(false)
  })

  it('maps stable context, prompt caching and JSON schema for OpenAI Chat', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        )
      }),
    )

    const enabledProfile = profile('openai-chat-completions')
    enabledProfile.capabilities.promptCaching = true
    await getAiProviderAdapter('openai-chat-completions').complete(enabledProfile, 'test-secret', {
      cache: { key: 'workspace-cache-key', stableContext: '{"workspace":"fixture"}' },
      jsonSchema: {
        name: 'fixture_schema',
        schema: {
          $schema: 'http://json-schema.org/draft-07/schema#',
          properties: {
            alternatives: {
              items: {
                properties: { reason: { type: 'string' }, target: { type: 'string' } },
                required: ['target'],
                type: 'object',
              },
              type: 'array',
            },
            ok: { type: 'boolean' },
          },
          required: ['ok'],
          type: 'object',
        },
      },
      maxOutputTokens: 512,
      system: 'Return JSON.',
      text: 'Analyze.',
    })

    expect(capturedBody.prompt_cache_key).toBe('workspace-cache-key')
    expect(capturedBody.messages).toEqual([
      { content: 'Return JSON.', role: 'system' },
      { content: '{"workspace":"fixture"}', role: 'user' },
      { content: 'Analyze.', role: 'user' },
    ])
    expect(capturedBody.response_format).toEqual({
      json_schema: {
        name: 'fixture_schema',
        schema: {
          additionalProperties: false,
          properties: {
            alternatives: {
              items: {
                additionalProperties: false,
                properties: { reason: { type: 'string' }, target: { type: 'string' } },
                required: ['reason', 'target'],
                type: 'object',
              },
              type: 'array',
            },
            ok: { type: 'boolean' },
          },
          required: ['alternatives', 'ok'],
          type: 'object',
        },
        strict: true,
      },
      type: 'json_schema',
    })
  })

  it('accepts Chat Completions shaped responses from compatible Responses endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'compatible response' } }] }),
            {
              headers: { 'content-type': 'application/json' },
              status: 200,
            },
          ),
      ),
    )

    await expect(
      getAiProviderAdapter('openai-responses').completeText(
        profile('openai-responses'),
        'test-secret',
        'Reply',
      ),
    ).resolves.toBe('compatible response')
  })

  it('uses Responses input messages for compatible OpenAI Responses services', async () => {
    let capturedInit: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedInit = init
        return new Response(JSON.stringify({ output_text: 'OK' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }),
    )

    await expect(
      getAiProviderAdapter('openai-responses').completeText(
        profile('openai-responses'),
        'test-secret',
        'Reply with OK only.',
      ),
    ).resolves.toBe('OK')
    expect(JSON.parse(String(capturedInit?.body))).toEqual({
      input: [
        {
          content: [{ text: 'Reply with OK only.', type: 'input_text' }],
          role: 'user',
        },
      ],
      max_output_tokens: 256,
      model: 'fixture-model',
      stream: true,
    })
  })

  it('collects Server-Sent Event text from Responses services that require streaming', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            [
              'event: response.output_text.delta',
              'data: {"type":"response.output_text.delta","delta":"流式"}',
              '',
              'event: response.output_text.delta',
              'data: {"type":"response.output_text.delta","delta":"正文"}',
              '',
              'event: response.completed',
              'data: {"response":{"id":"resp_fixture","output":[]}}',
              '',
            ].join('\n'),
            { headers: { 'content-type': 'text/event-stream' }, status: 200 },
          ),
      ),
    )

    await expect(
      getAiProviderAdapter('openai-responses').completeText(
        profile('openai-responses'),
        'test-secret',
        'Reply',
      ),
    ).resolves.toBe('流式正文')
  })

  it('shows a safe provider explanation for HTTP 400 parameter errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: { message: 'Unsupported parameter: max_output_tokens' } }),
            { headers: { 'content-type': 'application/json' }, status: 400 },
          ),
      ),
    )

    await expect(
      getAiProviderAdapter('openai-responses').completeText(
        profile('openai-responses'),
        'test-secret',
        'Reply',
      ),
    ).rejects.toMatchObject({
      code: 'AI_INVALID_RESPONSE',
      message: 'AI 服务拒绝了请求（HTTP 400）：Unsupported parameter: max_output_tokens',
    })
  })

  it('uses the Anthropic Messages contract and classifies rate limiting', async () => {
    const captured: Array<{ init?: RequestInit; url: string }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        captured.push({ init, url })
        if (captured.length === 1) {
          return new Response(JSON.stringify({ content: [{ text: 'OK', type: 'text' }] }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          })
        }
        return new Response('{}', { status: 429 })
      }),
    )

    const adapter = getAiProviderAdapter('anthropic-messages')
    await expect(
      adapter.completeText(
        profile('anthropic-messages'),
        'anthropic-secret',
        'Reply with OK only.',
      ),
    ).resolves.toBe('OK')
    expect(captured[0]?.url).toBe('https://provider.example/v1/messages')
    expect(captured[0]?.init?.headers).toMatchObject({
      'anthropic-version': '2023-06-01',
      'x-api-key': 'anthropic-secret',
    })
    await expect(
      adapter.completeText(
        profile('anthropic-messages'),
        'anthropic-secret',
        'Reply with OK only.',
      ),
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED' })
  })

  it('preserves Retry-After timing for bounded task retries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{}', {
            headers: { 'retry-after': '2.5' },
            status: 429,
          }),
      ),
    )

    await expect(
      getAiProviderAdapter('openai-chat-completions').completeText(
        profile('openai-chat-completions'),
        'test-secret',
        'Reply',
      ),
    ).rejects.toMatchObject({ code: 'AI_RATE_LIMITED', retryAfterMs: 2_500 })
  })

  it('maps an external AbortSignal to a user cancellation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        })
      }),
    )
    const controller = new AbortController()
    const completion = getAiProviderAdapter('openai-chat-completions').complete(
      profile('openai-chat-completions'),
      'test-secret',
      { maxOutputTokens: 256, signal: controller.signal, text: 'Reply' },
    )
    controller.abort()

    await expect(completion).rejects.toMatchObject({ code: 'AI_CANCELLED' })
  })

  it('marks only the stable Anthropic system prefix as cacheable', async () => {
    let capturedBody: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>
        return new Response(JSON.stringify({ content: [{ text: 'OK', type: 'text' }] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }),
    )
    const enabledProfile = profile('anthropic-messages')
    enabledProfile.capabilities.promptCaching = true

    await getAiProviderAdapter('anthropic-messages').complete(enabledProfile, 'test-secret', {
      cache: { key: 'ignored-by-anthropic', stableContext: '{"workspace":"fixture"}' },
      maxOutputTokens: 256,
      system: 'Task rules',
      text: 'Analyze',
    })

    expect(capturedBody.system).toEqual([
      { text: 'Task rules', type: 'text' },
      {
        cache_control: { type: 'ephemeral' },
        text: '{"workspace":"fixture"}',
        type: 'text',
      },
    ])
  })

  it('maps JSON schema to Gemini and Ollama structured output fields', async () => {
    const bodies: Record<string, unknown>[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return url.includes('generateContent')
          ? new Response(
              JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }),
              { headers: { 'content-type': 'application/json' }, status: 200 },
            )
          : new Response(JSON.stringify({ message: { content: 'OK' } }), {
              headers: { 'content-type': 'application/json' },
              status: 200,
            })
      }),
    )
    const jsonSchema = {
      name: 'fixture_schema',
      schema: { properties: { ok: { type: 'boolean' } }, required: ['ok'], type: 'object' },
    }

    await getAiProviderAdapter('gemini-generate-content').complete(
      profile('gemini-generate-content'),
      'test-secret',
      { jsonSchema, maxOutputTokens: 256, text: 'Analyze' },
    )
    await getAiProviderAdapter('ollama-chat').complete(profile('ollama-chat'), null, {
      jsonSchema,
      maxOutputTokens: 256,
      text: 'Analyze',
    })

    expect(bodies[0]?.generationConfig).toMatchObject({
      responseMimeType: 'application/json',
      responseSchema: jsonSchema.schema,
    })
    expect(bodies[1]?.format).toEqual(jsonSchema.schema)
  })
})
