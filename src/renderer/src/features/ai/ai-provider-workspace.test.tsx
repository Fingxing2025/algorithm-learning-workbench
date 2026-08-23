import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  AiProviderProfile,
  CreateAiProviderRequest,
  UpdateAiProviderRequest,
} from '@core/contracts/ai-provider'

import { AiProviderWorkspace } from './ai-provider-workspace'

const profile: AiProviderProfile = {
  baseUrl: 'https://api.example.com/v1',
  capabilities: {
    promptCaching: false,
    streaming: true,
    structuredOutput: true,
    vision: false,
  },
  createdAt: '2026-07-19T00:00:00.000Z',
  customHeaders: { 'X-Workspace': 'local' },
  hasSecret: true,
  id: '11111111-1111-4111-8111-111111111111',
  model: 'fixture-model',
  name: '本地 OpenAI',
  protocol: 'openai-chat-completions',
  timeoutMs: 30_000,
  updatedAt: '2026-07-19T00:00:00.000Z',
}

function installDesktopMock(profiles: AiProviderProfile[] = []) {
  const create = vi.fn(async (request: CreateAiProviderRequest) => ({
    ...profile,
    ...request,
    hasSecret: Boolean(request.apiKey),
    id: '22222222-2222-4222-8222-222222222222',
    name: request.name,
  }))
  const update = vi.fn(async (request: UpdateAiProviderRequest) => ({
    ...profile,
    ...request,
    hasSecret: true,
    updatedAt: '2026-07-19T01:00:00.000Z',
  }))
  const upsertRoute = vi.fn(async ({ providerId, task }) => ({
    providerId,
    task,
    updatedAt: '2026-07-19T01:00:00.000Z',
  }))

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      aiProviders: {
        create,
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue(profiles),
        listRoutes: vi.fn().mockResolvedValue([]),
        testConnection: vi.fn().mockResolvedValue({
          latencyMs: 12,
          message: '连接成功。',
          model: profile.model,
          ok: true,
        }),
        update,
        upsertRoute,
      },
    },
  })

  return { create, update, upsertRoute }
}

describe('AiProviderWorkspace', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('preserves the saved key when updating a profile and delegates task routing', async () => {
    const desktop = installDesktopMock([profile])
    render(<AiProviderWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: /本地 OpenAI/ }))
    expect(screen.getByText('密钥已保存')).toBeInTheDocument()
    expect(screen.getByLabelText('API Key')).toHaveValue('')

    fireEvent.change(screen.getByLabelText('Provider 显示名称'), {
      target: { value: '本地 OpenAI 更新' },
    })
    fireEvent.change(screen.getByLabelText('自定义请求头'), {
      target: { value: '{"X-Workspace":"updated"}' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存更改' }))

    await waitFor(() =>
      expect(desktop.update).toHaveBeenCalledWith({
        apiKey: undefined,
        baseUrl: profile.baseUrl,
        capabilities: profile.capabilities,
        clearApiKey: false,
        customHeaders: { 'X-Workspace': 'updated' },
        id: profile.id,
        model: profile.model,
        name: '本地 OpenAI 更新',
        protocol: profile.protocol,
        timeoutMs: profile.timeoutMs,
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Provider 配置已更新。')

    fireEvent.click(screen.getByRole('button', { name: /模板元数据补全/ }))
    await waitFor(() =>
      expect(desktop.upsertRoute).toHaveBeenCalledWith({
        providerId: profile.id,
        task: 'template-metadata',
      }),
    )
  })

  it('applies a provider preset before creating the profile', async () => {
    const desktop = installDesktopMock()
    render(<AiProviderWorkspace />)

    fireEvent.click(await screen.findByRole('button', { name: '使用预设 DeepSeek' }))
    expect(screen.getByLabelText('Provider 显示名称')).toHaveValue('DeepSeek')
    expect(screen.getByLabelText('Provider 协议')).toHaveValue('openai-chat-completions')
    expect(screen.getByLabelText('Base URL')).toHaveValue('https://api.deepseek.com/v1')
    expect(screen.getByLabelText('模型名称')).toHaveValue('deepseek-v4-flash')

    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'fixture-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存 Provider' }))

    await waitFor(() =>
      expect(desktop.create).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'fixture-secret',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-v4-flash',
          name: 'DeepSeek',
          protocol: 'openai-chat-completions',
          timeoutMs: 60_000,
        }),
      ),
    )
  })

  it('rejects non-object custom headers before calling the desktop API', async () => {
    const desktop = installDesktopMock()
    render(<AiProviderWorkspace />)

    await screen.findByRole('heading', { level: 1, name: 'AI 设置' })
    fireEvent.change(screen.getByLabelText('自定义请求头'), { target: { value: '[]' } })
    fireEvent.submit(screen.getByRole('button', { name: '保存 Provider' }).closest('form')!)

    expect(await screen.findByRole('alert')).toHaveTextContent('自定义请求头必须是 JSON 对象。')
    expect(desktop.create).not.toHaveBeenCalled()
  })
})
