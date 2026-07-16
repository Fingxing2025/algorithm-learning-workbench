import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AiProviderRepository, AiProviderRecord } from '../database/ai-provider-repository'
import type { SecretStore } from '../security/secret-store'
import { AiProviderService } from './ai-provider-service'

const record: AiProviderRecord = {
  baseUrl: 'https://provider.example/v1',
  capabilitiesJson: JSON.stringify({
    promptCaching: false,
    streaming: false,
    structuredOutput: true,
    vision: false,
  }),
  createdAt: '2026-07-16T00:00:00.000Z',
  customHeadersJson: '{}',
  id: '10000000-0000-4000-8000-000000000001',
  model: 'compatible-model',
  name: 'Compatible Provider',
  protocol: 'openai-chat-completions',
  secretRef: 'secret-ref',
  timeoutMs: 30_000,
  updatedAt: '2026-07-16T00:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AiProviderService output token budgets', () => {
  it('starts high and lowers only after explicit token-limit rejections', async () => {
    const observedBudgets: number[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as { max_tokens: number }
        observedBudgets.push(body.max_tokens)
        if (body.max_tokens > 8_192) {
          return new Response(
            JSON.stringify({ error: { message: 'max_tokens must be less than or equal to 8192' } }),
            { headers: { 'content-type': 'application/json' }, status: 400 },
          )
        }
        return new Response(
          JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        )
      }),
    )
    const repository = {
      getProviderForTask: () => record,
    } as unknown as AiProviderRepository
    const secretStore = { read: async () => 'test-secret' } as unknown as SecretStore
    const service = new AiProviderService(repository, secretStore)

    await expect(
      service.runTask('template-metadata', {
        maxOutputTokens: 32_768,
        text: 'Analyze.',
      }),
    ).resolves.toMatchObject({ text: '{"ok":true}' })
    expect(observedBudgets).toEqual([32_768, 16_384, 8_192])
  })

  it('does not lower the budget for unrelated HTTP 400 parameter errors', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Unsupported response_format' } }), {
          headers: { 'content-type': 'application/json' },
          status: 400,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const repository = {
      getProviderForTask: () => record,
    } as unknown as AiProviderRepository
    const secretStore = { read: async () => 'test-secret' } as unknown as SecretStore
    const service = new AiProviderService(repository, secretStore)

    await expect(
      service.runTask('template-metadata', {
        maxOutputTokens: 32_768,
        text: 'Analyze.',
      }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
