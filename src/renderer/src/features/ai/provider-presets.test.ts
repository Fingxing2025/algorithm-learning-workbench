import { describe, expect, it } from 'vitest'

import { getProviderPreset } from './provider-presets'

describe('provider presets', () => {
  it('uses the current DeepSeek OpenAI-compatible endpoint and non-legacy model', () => {
    const preset = getProviderPreset('deepseek')

    expect(preset.baseUrl).toBe('https://api.deepseek.com/v1')
    expect(preset.model).toBe('deepseek-v4-flash')
    expect(preset.protocol).toBe('openai-chat-completions')
    expect(preset.capabilities.vision).toBe(false)
  })

  it('requires the user-specific Alibaba Cloud workspace endpoint', () => {
    const preset = getProviderPreset('aliyun-bailian')

    expect(preset.baseUrl).toBe('')
    expect(preset.baseUrlPlaceholder).toContain('<WorkspaceId>.cn-beijing.maas.aliyuncs.com')
    expect(preset.model).toBe('qwen-plus')
    expect(preset.capabilities.vision).toBe(false)
  })
})
