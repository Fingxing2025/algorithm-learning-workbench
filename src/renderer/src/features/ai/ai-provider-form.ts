import type {
  AiProviderCapabilities,
  AiProviderProfile,
  AiProviderProtocol,
} from '@core/contracts/ai-provider'

export interface AiProviderFormState {
  apiKey: string
  baseUrl: string
  capabilities: AiProviderCapabilities
  customHeadersText: string
  model: string
  name: string
  protocol: AiProviderProtocol
  timeoutSeconds: string
}

export const providerProtocolOptions: Array<{
  defaultBaseUrl: string
  label: string
  value: AiProviderProtocol
}> = [
  {
    defaultBaseUrl: 'https://api.openai.com/v1',
    label: 'OpenAI Chat Completions',
    value: 'openai-chat-completions',
  },
  {
    defaultBaseUrl: 'https://api.openai.com/v1',
    label: 'OpenAI Responses',
    value: 'openai-responses',
  },
  {
    defaultBaseUrl: 'https://api.anthropic.com/v1',
    label: 'Anthropic Messages',
    value: 'anthropic-messages',
  },
  {
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    label: 'Gemini GenerateContent',
    value: 'gemini-generate-content',
  },
  { defaultBaseUrl: 'http://localhost:11434', label: 'Ollama', value: 'ollama-chat' },
]

export const emptyAiProviderForm: AiProviderFormState = {
  apiKey: '',
  baseUrl: providerProtocolOptions[0]!.defaultBaseUrl,
  capabilities: {
    promptCaching: false,
    streaming: true,
    structuredOutput: true,
    vision: false,
  },
  customHeadersText: '{}',
  model: '',
  name: '',
  protocol: 'openai-chat-completions',
  timeoutSeconds: '30',
}

export function profileToAiProviderForm(profile: AiProviderProfile): AiProviderFormState {
  return {
    apiKey: '',
    baseUrl: profile.baseUrl,
    capabilities: profile.capabilities,
    customHeadersText: JSON.stringify(profile.customHeaders, null, 2),
    model: profile.model,
    name: profile.name,
    protocol: profile.protocol,
    timeoutSeconds: String(profile.timeoutMs / 1000),
  }
}

export function providerProtocolLabel(protocol: AiProviderProtocol): string {
  return providerProtocolOptions.find(option => option.value === protocol)?.label ?? protocol
}

export function parseProviderCustomHeaders(text: string): Record<string, string> {
  const value = JSON.parse(text) as unknown
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('自定义请求头必须是 JSON 对象。')
  }
  if (!Object.values(value).every(item => typeof item === 'string')) {
    throw new Error('自定义请求头的值必须全部是字符串。')
  }
  return value as Record<string, string>
}
