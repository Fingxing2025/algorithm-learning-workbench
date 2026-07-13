import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import App from './App'

const templateId = 'a'.repeat(64)

const workspaceFixture: WorkspaceSnapshot = {
  available: true,
  id: '40000000-0000-4000-8000-000000000001',
  name: '算法模板',
  rootPath: '/tmp/算法模板',
  scannedAt: '2026-07-14T08:00:00.000Z',
  summary: {
    caseConflictCount: 0,
    issues: [],
    skippedSymlinkCount: 0,
    templateCount: 1,
    truncated: false,
    unsupportedFileCount: 0,
  },
  templates: [
    {
      extension: '.cpp',
      fileName: 'bfs.cpp',
      id: templateId,
      language: 'C++',
      modifiedAt: '2026-07-14T08:00:00.000Z',
      name: 'bfs',
      relativePath: '基础算法/搜索/BFS/bfs.cpp',
      sizeBytes: 42,
    },
  ],
}

function installDesktopMock(currentWorkspace: WorkspaceSnapshot | null) {
  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      app: {
        getRuntimeInfo: vi.fn().mockResolvedValue({
          appVersion: '0.1.0',
          electronVersion: '43.1.0',
          isPackaged: false,
          platform: 'darwin',
        }),
      },
      templates: {
        create: vi.fn(),
        performAction: vi.fn().mockResolvedValue(undefined),
        readSource: vi.fn().mockResolvedValue({
          content: 'void bfs() {}',
          id: templateId,
          language: 'C++',
          relativePath: '基础算法/搜索/BFS/bfs.cpp',
        }),
      },
      workspace: {
        choose: vi.fn().mockResolvedValue(null),
        getCurrent: vi.fn().mockResolvedValue(currentWorkspace),
        rescan: vi.fn().mockResolvedValue(currentWorkspace),
      },
    },
  })
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('shows first-run workspace onboarding and runtime status', async () => {
    installDesktopMock(null)
    render(<App />)

    expect(
      await screen.findByRole('heading', { level: 1, name: '连接你的模板工作区' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '创建工作区' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '选择目录' })).toBeEnabled()
    expect(await screen.findByText('Electron 43.1.0 · darwin')).toBeInTheDocument()
    expect(screen.getByText('尚未连接工作区')).toBeInTheDocument()
  })

  it('opens empty global search and switches theme', async () => {
    installDesktopMock(null)
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { name: '连接你的模板工作区' })
    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('工作区中还没有模板')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭全局搜索' }))
    await user.click(screen.getByRole('button', { name: '切换到深色主题' }))
    expect(document.documentElement).toHaveClass('dark')
  })

  it('opens a template from global search and loads source through the desktop API', async () => {
    installDesktopMock(workspaceFixture)
    const user = userEvent.setup()
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: '工作台' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    await user.type(screen.getByRole('textbox', { name: '搜索模板、题目或操作' }), 'bfs')
    await user.click(screen.getByRole('button', { name: /bfs.*基础算法/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'bfs' })).toBeInTheDocument()
    expect(await screen.findByText('void bfs() {}')).toBeInTheDocument()
  })
})
