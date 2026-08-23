import { z, type ZodType } from 'zod'

import type { AiTaskKind } from '@core/contracts/ai-provider'
import type { AiErrorStage } from '@core/contracts/ipc-result'

import { PublicError } from '../errors/public-error'
import { normalizeCommonAiEnvelope, parseAiJson } from './ai-response-json'
import type { AiProviderService } from './ai-provider-service'
import type { AiCompletionRequest } from './ai-provider-adapters'

const MAX_REPAIR_INPUT_CHARS = 32_000
type StructuredAiStage =
  'initial-generation' | 'schema-fallback' | 'semantic-retry' | 'structure-repair'

function isNativeStructuredOutputRejection(error: unknown): boolean {
  return (
    error instanceof PublicError &&
    error.code === 'AI_INVALID_RESPONSE' &&
    error.providerReason === 'structured-output-unsupported'
  )
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new PublicError('AI_CANCELLED', 'AI 请求已取消，迟到响应不会写入状态。')
  }
}

export async function runStructuredAiTask<Output>(args: {
  aiProviderService: AiProviderService
  allowSemanticFallback?: boolean
  invalidMessage: string
  normalize?: (value: unknown) => unknown
  request: AiCompletionRequest
  schema: ZodType<Output>
  schemaName: string
  semanticRetryInstruction?: string
  task: AiTaskKind
  validate?: (value: Output) => void
}): Promise<{
  data: Output
  diagnostic: {
    outputTokenBudgets: number[]
    providerCallCount: number
    stageTimings: Array<{
      elapsedMs: number
      requestCount: number
      stage: StructuredAiStage
    }>
    totalElapsedMs: number
  }
  model: string
  providerName: string
}> {
  const jsonSchema = {
    name: args.schemaName,
    schema: z.toJSONSchema(args.schema, { target: 'draft-7' }) as Record<string, unknown>,
  }
  const schemaInstruction = `输出必须符合以下 JSON Schema：${JSON.stringify(jsonSchema.schema)}`
  const startedAt = Date.now()
  const outputTokenBudgets: number[] = []
  const stageTimings: Array<{
    elapsedMs: number
    requestCount: number
    stage: StructuredAiStage
  }> = []
  let providerCallCount = 0
  let nativeStructuredOutputUnavailable = false
  const runStage = async (stage: StructuredAiStage, request: AiCompletionRequest) => {
    throwIfCancelled(request.signal)
    const stageStartedAt = Date.now()
    let stageRequestCount = 0
    try {
      return await args.aiProviderService.runTask(args.task, {
        ...request,
        onAttempt: attempt => {
          request.onAttempt?.(attempt)
          stageRequestCount += 1
          providerCallCount += 1
          outputTokenBudgets.push(attempt.maxOutputTokens)
        },
      })
    } finally {
      if (stageRequestCount === 0) {
        stageRequestCount = 1
        providerCallCount += 1
        outputTokenBudgets.push(request.maxOutputTokens)
      }
      stageTimings.push({
        elapsedMs: Date.now() - stageStartedAt,
        requestCount: stageRequestCount,
        stage,
      })
    }
  }
  const complete = async (request: AiCompletionRequest, stage: StructuredAiStage) => {
    throwIfCancelled(request.signal)
    const structuredRequest = { ...request, disableThinking: true }
    const effectiveRequest = nativeStructuredOutputUnavailable
      ? { ...structuredRequest, jsonSchema: undefined }
      : structuredRequest
    try {
      return await runStage(stage, effectiveRequest)
    } catch (error) {
      if (!effectiveRequest.jsonSchema || !isNativeStructuredOutputRejection(error)) throw error
      nativeStructuredOutputUnavailable = true
      return runStage('schema-fallback', { ...effectiveRequest, jsonSchema: undefined })
    }
  }
  let completion = await complete(
    {
      ...args.request,
      jsonSchema,
      system: [args.request.system, schemaInstruction].filter(Boolean).join('\n'),
    },
    'initial-generation',
  )
  const parse = (text: string): { data: Output | null; failureStage: AiErrorStage | null } => {
    let parsed: unknown
    try {
      parsed = parseAiJson(text)
    } catch {
      return { data: null, failureStage: 'json-extraction' }
    }
    let normalized: unknown
    try {
      const commonEnvelope = normalizeCommonAiEnvelope(parsed)
      normalized = args.normalize ? args.normalize(commonEnvelope) : commonEnvelope
    } catch {
      return { data: null, failureStage: 'envelope-normalization' }
    }
    const result = args.schema.safeParse(normalized)
    return result.success
      ? { data: result.data, failureStage: null }
      : { data: null, failureStage: 'schema-validation' }
  }
  let parsed = parse(completion.text)
  let data = parsed.data
  if (!data) {
    throwIfCancelled(args.request.signal)
    completion = await complete(
      {
        jsonSchema,
        maxOutputTokens: args.request.maxOutputTokens,
        signal: args.request.signal,
        system: [
          '你是 JSON 格式修复器。只修复输入的结构以符合给定 Schema。',
          '不添加新的分类、候选模板、题目事实或文件操作。',
          '不输出 Markdown、解释或思考过程，只输出修复后的 JSON。',
          schemaInstruction,
        ].join('\n'),
        text: JSON.stringify({ invalidOutput: completion.text.slice(0, MAX_REPAIR_INPUT_CHARS) }),
      },
      'structure-repair',
    )
    parsed = parse(completion.text)
    data = parsed.data
  }
  if (!data) {
    throw new PublicError('AI_INVALID_RESPONSE', args.invalidMessage, undefined, 'structure-repair')
  }
  const validationError = (value: Output): PublicError | null => {
    try {
      args.validate?.(value)
      return null
    } catch (error) {
      if (error instanceof PublicError && error.code === 'AI_INVALID_RESPONSE') return error
      throw error
    }
  }
  const firstValidationError = validationError(data)
  if (firstValidationError) {
    throwIfCancelled(args.request.signal)
    const schemaValidFallback = data
    try {
      completion = await complete(
        {
          ...args.request,
          jsonSchema,
          system: [
            args.request.system,
            schemaInstruction,
            '上一次输出通过了 JSON 结构校验，但违反了业务语言约束。请基于原始输入重新输出完整 JSON。',
            `需要修正的问题：${firstValidationError.message}`,
            args.semanticRetryInstruction,
            '只修正违反约束的字段，不改变用户已确认内容、源码事实或文件扩展名。不要输出 Markdown、解释或思考过程。',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        'semantic-retry',
      )
      parsed = parse(completion.text)
      data = parsed.data
      if (!data) {
        if (!args.allowSemanticFallback) {
          throw new PublicError(
            'AI_INVALID_RESPONSE',
            args.invalidMessage,
            undefined,
            'schema-validation',
          )
        }
        data = schemaValidFallback
      }
    } catch (error) {
      if (
        !args.allowSemanticFallback ||
        (error instanceof PublicError && error.code === 'AI_CANCELLED')
      ) {
        throw error
      }
      data = schemaValidFallback
    }
    const secondValidationError = validationError(data)
    if (secondValidationError && !args.allowSemanticFallback) {
      throw new PublicError(
        'AI_INVALID_RESPONSE',
        args.invalidMessage,
        undefined,
        'semantic-validation',
      )
    }
  }
  throwIfCancelled(args.request.signal)
  return {
    data,
    diagnostic: {
      outputTokenBudgets,
      providerCallCount,
      stageTimings,
      totalElapsedMs: Date.now() - startedAt,
    },
    model: completion.model,
    providerName: completion.providerName,
  }
}
