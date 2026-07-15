import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiProviderProtocol } from '@core/contracts/ai-provider'

import { getAiProviderAdapter } from './ai-provider-adapters'

function profile(protocol: AiProviderProtocol) {
  return {
    baseUrl: 'https://provider.example/v1',
    capabilities: { streaming: true, structuredOutput: true, vision: true },
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
    })
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
})
