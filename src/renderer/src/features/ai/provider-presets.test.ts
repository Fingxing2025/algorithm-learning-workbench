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

  it('uses the configured Alibaba Cloud endpoint and visual model', () => {
    const preset = getProviderPreset('aliyun-bailian')

    expect(preset.baseUrl).toBe(
      'https://ws-q88wpweukv7ai50n.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
    )
    expect(preset.baseUrlPlaceholder).toBe(preset.baseUrl)
    expect(preset.model).toBe('qwen3-vl-plus')
    expect(preset.capabilities.vision).toBe(true)
  })
})
