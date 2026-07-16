import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'

import { PublicError } from '../errors/public-error'
import type { AiProviderService } from './ai-provider-service'
import { runStructuredAiTask } from './structured-ai-task'

const resultSchema = z.object({ count: z.number().int().nonnegative() }).strict()

describe('runStructuredAiTask', () => {
  it('performs one constrained repair after an invalid structured response', async () => {
    const runTask = vi
      .fn()
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":"2"}' })
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":2}' })
    const result = await runStructuredAiTask({
      aiProviderService: { runTask } as unknown as AiProviderService,
      invalidMessage: '结构无效',
      request: { maxOutputTokens: 800, system: '业务指令', text: '用户输入' },
      schema: resultSchema,
      schemaName: 'fixture_result',
      task: 'template-metadata',
    })

    expect(result.data).toEqual({ count: 2 })
    expect(result.diagnostic).toMatchObject({
      outputTokenBudgets: [800, 800],
      providerCallCount: 2,
      stageTimings: [
        { requestCount: 1, stage: 'initial-generation' },
        { requestCount: 1, stage: 'structure-repair' },
      ],
    })
    expect(runTask).toHaveBeenCalledTimes(2)
    expect(runTask.mock.calls[1]?.[1]).toMatchObject({
      disableThinking: true,
      maxOutputTokens: 800,
      system: expect.stringContaining('JSON 格式修复器'),
    })
    expect(JSON.parse(runTask.mock.calls[1]?.[1].text)).toEqual({
      invalidOutput: '{"count":"2"}',
    })
  })

  it('fails safely after the single repair attempt also violates the schema', async () => {
    const runTask = vi.fn().mockResolvedValue({
      model: 'fixture',
      providerName: 'Fixture',
      text: '{"count":-1}',
    })

    await expect(
      runStructuredAiTask({
        aiProviderService: { runTask } as unknown as AiProviderService,
        invalidMessage: '结构无效',
        request: { maxOutputTokens: 800, text: '用户输入' },
        schema: resultSchema,
        schemaName: 'fixture_result',
        task: 'problem-image-analysis',
      }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE', message: '结构无效' })
    expect(runTask).toHaveBeenCalledTimes(2)
  })

  it('falls back to prompt-schema validation when a compatible endpoint rejects response_format', async () => {
    const runTask = vi
      .fn()
      .mockRejectedValueOnce(
        new PublicError(
          'AI_INVALID_RESPONSE',
          'AI 服务拒绝了请求（HTTP 400）：This response_format type is unavailable now',
        ),
      )
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":2}' })

    const result = await runStructuredAiTask({
      aiProviderService: { runTask } as unknown as AiProviderService,
      invalidMessage: '结构无效',
      request: { maxOutputTokens: 800, text: '用户输入' },
      schema: resultSchema,
      schemaName: 'fixture_result',
      task: 'template-metadata',
    })
    expect(result.data).toEqual({ count: 2 })
    expect(runTask).toHaveBeenCalledTimes(2)
    expect(result.diagnostic).toMatchObject({
      outputTokenBudgets: [800, 800],
      providerCallCount: 2,
      stageTimings: [
        { requestCount: 1, stage: 'initial-generation' },
        { requestCount: 1, stage: 'schema-fallback' },
      ],
    })
    expect(runTask.mock.calls[0]?.[1].jsonSchema).toBeDefined()
    expect(runTask.mock.calls[1]?.[1].jsonSchema).toBeUndefined()
    expect(runTask.mock.calls[1]?.[1].system).toContain('JSON Schema')
  })

  it('does not downgrade or retry authentication failures', async () => {
    const runTask = vi
      .fn()
      .mockRejectedValue(new PublicError('AI_AUTH_FAILED', '鉴权失败，请检查 API Key。'))

    await expect(
      runStructuredAiTask({
        aiProviderService: { runTask } as unknown as AiProviderService,
        invalidMessage: '结构无效',
        request: { maxOutputTokens: 800, text: '用户输入' },
        schema: resultSchema,
        schemaName: 'fixture_result',
        task: 'template-metadata',
      }),
    ).rejects.toMatchObject({ code: 'AI_AUTH_FAILED' })
    expect(runTask).toHaveBeenCalledTimes(1)
  })

  it('performs one constrained semantic retry after schema-valid output fails validation', async () => {
    const runTask = vi
      .fn()
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":1}' })
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":2}' })

    await expect(
      runStructuredAiTask({
        aiProviderService: { runTask } as unknown as AiProviderService,
        invalidMessage: '语义连续无效',
        request: {
          cache: { key: 'workspace-cache', stableContext: '{"directories":[]}' },
          maxOutputTokens: 800,
          system: '业务指令',
          text: '原始源码与草稿',
        },
        schema: resultSchema,
        schemaName: 'fixture_result',
        semanticRetryInstruction: '将结果修正为偶数。',
        task: 'template-metadata',
        validate: value => {
          if (value.count % 2 !== 0) {
            throw new PublicError('AI_INVALID_RESPONSE', '结果必须是偶数。')
          }
        },
      }),
    ).resolves.toMatchObject({ data: { count: 2 } })
    expect(runTask).toHaveBeenCalledTimes(2)
    expect(runTask.mock.calls[1]?.[1]).toMatchObject({
      cache: { key: 'workspace-cache', stableContext: '{"directories":[]}' },
      disableThinking: true,
      text: '原始源码与草稿',
    })
    expect(runTask.mock.calls[1]?.[1].system).toContain('结果必须是偶数')
    expect(runTask.mock.calls[1]?.[1].system).toContain('将结果修正为偶数')
  })

  it('can return the second schema-valid result for user review after semantic retry', async () => {
    const runTask = vi
      .fn()
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":1}' })
      .mockResolvedValueOnce({ model: 'fixture', providerName: 'Fixture', text: '{"count":3}' })

    await expect(
      runStructuredAiTask({
        aiProviderService: { runTask } as unknown as AiProviderService,
        allowSemanticFallback: true,
        invalidMessage: '语义连续无效',
        request: { maxOutputTokens: 800, system: '业务指令', text: '原始输入' },
        schema: resultSchema,
        schemaName: 'fixture_result',
        semanticRetryInstruction: '将结果修正为偶数。',
        task: 'template-metadata',
        validate: value => {
          if (value.count % 2 !== 0) {
            throw new PublicError('AI_INVALID_RESPONSE', '结果必须是偶数。')
          }
        },
      }),
    ).resolves.toMatchObject({ data: { count: 3 } })
    expect(runTask).toHaveBeenCalledTimes(2)
  })
})
