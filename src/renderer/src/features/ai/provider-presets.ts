import type { AiProviderCapabilities, AiProviderProtocol } from '@core/contracts/ai-provider'

export type ProviderPresetId = 'aliyun-bailian' | 'deepseek'

export interface ProviderPreset {
  baseUrl: string
  baseUrlPlaceholder: string
  capabilities: AiProviderCapabilities
  description: string
  id: ProviderPresetId
  model: string
  modelHint: string
  name: string
  protocol: AiProviderProtocol
  timeoutSeconds: string
}

export const providerPresets: readonly ProviderPreset[] = [
  {
    baseUrl: 'https://api.deepseek.com',
    baseUrlPlaceholder: 'https://api.deepseek.com',
    capabilities: { streaming: true, structuredOutput: true, vision: false },
    description: '官方 OpenAI 兼容接口，适合文本分析、模板元数据和文件计划。',
    id: 'deepseek',
    model: 'deepseek-v4-flash',
    modelHint: '可改为 deepseek-v4-pro；旧 deepseek-chat 即将弃用。',
    name: 'DeepSeek',
    protocol: 'openai-chat-completions',
    timeoutSeconds: '60',
  },
  {
    baseUrl: '',
    baseUrlPlaceholder: 'https://<WorkspaceId>.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    capabilities: { streaming: true, structuredOutput: true, vision: false },
    description: '阿里云百炼 OpenAI 兼容接口；中国大陆端点需要工作空间 ID。',
    id: 'aliyun-bailian',
    model: 'qwen-plus',
    modelHint: '需要视觉时请换用支持图片的千问模型，并勾选视觉输入。',
    name: '阿里云百炼',
    protocol: 'openai-chat-completions',
    timeoutSeconds: '60',
  },
] as const

export function getProviderPreset(id: ProviderPresetId): ProviderPreset {
  return providerPresets.find(preset => preset.id === id)!
}
