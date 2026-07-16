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
    baseUrl: 'https://api.deepseek.com/v1',
    baseUrlPlaceholder: 'https://api.deepseek.com/v1',
    capabilities: {
      promptCaching: false,
      streaming: true,
      structuredOutput: true,
      vision: false,
    },
    description: '官方 OpenAI 兼容接口，适合文本分析、模板元数据和文件计划。',
    id: 'deepseek',
    model: 'deepseek-v4-flash',
    modelHint: '可改为 deepseek-v4-pro；旧 deepseek-chat 即将弃用。',
    name: 'DeepSeek',
    protocol: 'openai-chat-completions',
    timeoutSeconds: '60',
  },
  {
    baseUrl: 'https://ws-q88wpweukv7ai50n.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    baseUrlPlaceholder:
      'https://ws-q88wpweukv7ai50n.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    capabilities: {
      promptCaching: false,
      streaming: true,
      structuredOutput: true,
      vision: true,
    },
    description: '阿里云百炼 OpenAI 兼容接口，预设 Qwen3 VL Plus 视觉模型。',
    id: 'aliyun-bailian',
    model: 'qwen3-vl-plus',
    modelHint: '支持文本与视觉输入；可按阿里云控制台实际可用模型调整。',
    name: '阿里云百炼',
    protocol: 'openai-chat-completions',
    timeoutSeconds: '60',
  },
] as const

export function getProviderPreset(id: ProviderPresetId): ProviderPreset {
  return providerPresets.find(preset => preset.id === id)!
}
