import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Problem } from '@core/contracts/problem'
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
  templatePage: {
    nextAction: null,
    nextCursor: null,
    processedCount: 1,
    totalCount: 1,
    truncated: false,
    truncatedReason: null,
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

const problemFixture: Problem = {
  aiSummary: '',
  analysis: {
    algorithmSignals: [],
    constraints: [],
    edgeCases: [],
    examples: [],
    inputDescription: '',
    outputDescription: '',
  },
  createdAt: '2026-07-14T08:00:00.000Z',
  difficulty: '提高',
  id: '50000000-0000-4000-8000-000000000001',
  images: [],
  notes: '注意初始化距离。',
  platform: '洛谷',
  problemCode: 'P3371',
  relations: [
    {
      available: true,
      createdAt: '2026-07-14T08:00:00.000Z',
      language: 'C++',
      note: '',
      relationType: 'used',
      source: 'manual',
      templateId,
      templateName: 'bfs',
      templatePath: '基础算法/搜索/BFS/bfs.cpp',
      updatedAt: '2026-07-14T08:00:00.000Z',
    },
  ],
  statement: '给定一张图，求最短路。',
  status: 'attempted',
  tags: ['图论', '最短路'],
  title: '单源最短路径',
  updatedAt: '2026-07-14T08:00:00.000Z',
  url: null,
}

function installDesktopMock(currentWorkspace: WorkspaceSnapshot | null, problems: Problem[] = []) {
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
      problems: {
        addImages: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
        get: vi
          .fn()
          .mockImplementation(({ problemId }: { problemId: string }) =>
            Promise.resolve(problems.find(problem => problem.id === problemId) ?? null),
          ),
        list: vi.fn().mockResolvedValue(problems),
        listByTemplate: vi.fn().mockResolvedValue({
          items: [],
          nextAction: null,
          nextCursor: null,
          processedCount: 0,
          totalCount: 0,
          truncated: false,
          truncatedReason: null,
        }),
        listPage: vi.fn().mockResolvedValue({
          items: problems,
          matchedCount: problems.length,
          nextAction: null,
          nextCursor: null,
          processedCount: problems.length,
          totalCount: problems.length,
          totalRelationCount: problems.reduce(
            (count, problem) => count + problem.relations.length,
            0,
          ),
          truncated: false,
          truncatedReason: null,
        }),
        readImage: vi.fn(),
        removeImage: vi.fn(),
        removeRelation: vi.fn(),
        update: vi.fn(),
        upsertRelation: vi.fn(),
      },
      templates: {
        create: vi.fn(),
        getSummary: vi
          .fn()
          .mockImplementation(({ templateId }: { templateId: string }) =>
            Promise.resolve(
              currentWorkspace?.templates.find(template => template.id === templateId),
            ),
          ),
        listPage: vi.fn().mockResolvedValue({
          items: currentWorkspace?.templates ?? [],
          nextAction: null,
          nextCursor: null,
          processedCount: currentWorkspace?.templates.length ?? 0,
          totalCount: currentWorkspace?.templates.length ?? 0,
          truncated: false,
          truncatedReason: null,
        }),
        performAction: vi.fn().mockResolvedValue(undefined),
        readSource: vi.fn().mockResolvedValue({
          content: 'void bfs() {}',
          id: templateId,
          language: 'C++',
          relativePath: '基础算法/搜索/BFS/bfs.cpp',
        }),
      },
      templateManagement: {
        auditWorkspace: vi.fn(),
        chooseImportSource: vi.fn(),
        classify: vi.fn(),
        getMetadata: vi.fn().mockResolvedValue(null),
        importTemplate: vi.fn(),
        listFileExecutions: vi.fn().mockResolvedValue([]),
        listFileExecutionsPage: vi.fn().mockResolvedValue({
          items: [],
          nextAction: null,
          nextCursor: null,
          processedCount: 0,
          totalCount: 0,
          truncated: false,
          truncatedReason: null,
        }),
        listFilePlans: vi.fn().mockResolvedValue([]),
        listFilePlansPage: vi.fn().mockResolvedValue({
          draftCount: 0,
          items: [],
          nextAction: null,
          nextCursor: null,
          processedCount: 0,
          totalCount: 0,
          truncated: false,
          truncatedReason: null,
        }),
        updateMetadata: vi.fn(),
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
    expect(screen.getByText('V2 · 0.1.0')).toBeInTheDocument()
    expect(screen.getByText('尚未连接工作区')).toBeInTheDocument()
  })

  it('opens empty global search and switches theme', async () => {
    installDesktopMock(null)
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { name: '连接你的模板工作区' })
    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('本地知识库还是空的')).toBeInTheDocument()

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
    await user.click(await screen.findByRole('button', { name: /bfs.*基础算法/ }))

    expect(await screen.findByRole('heading', { level: 1, name: 'bfs' })).toBeInTheDocument()
    expect(await screen.findByLabelText('高亮模板源码')).toHaveTextContent('void bfs() {}')
  })

  it('opens a problem card from global search', async () => {
    installDesktopMock(workspaceFixture, [problemFixture])
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { level: 1, name: '工作台' })
    await user.click(screen.getByRole('button', { name: '打开全局搜索' }))
    await user.type(screen.getByRole('textbox', { name: '搜索模板、题目或操作' }), '单源')
    await user.click(await screen.findByRole('button', { name: /单源最短路径.*洛谷/ }))

    expect(
      await screen.findByRole('heading', { level: 2, name: '单源最短路径' }),
    ).toBeInTheDocument()
    expect(screen.getByText('给定一张图，求最短路。')).toBeInTheDocument()
  })

  it('supports desktop navigation shortcuts without replacing command search', async () => {
    installDesktopMock(workspaceFixture, [problemFixture])
    render(<App />)

    await screen.findByRole('heading', { level: 1, name: '工作台' })
    expect(screen.getByRole('button', { name: '搜索知识库' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '打开模板创建窗口' })).toBeEnabled()

    fireEvent.keyDown(window, { key: '2', metaKey: true })
    expect(await screen.findByRole('heading', { level: 1, name: '模板库' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: '1', metaKey: true })
    expect(await screen.findByRole('heading', { level: 1, name: '工作台' })).toBeInTheDocument()
  })

  it('keeps the dashboard vertically scrollable and opens all three summary destinations', async () => {
    installDesktopMock(workspaceFixture, [problemFixture])
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('heading', { level: 1, name: '工作台' })
    expect(screen.getByTestId('dashboard-scroll-region')).toHaveClass(
      'h-full',
      'overflow-y-auto',
      'overscroll-contain',
    )

    await user.click(screen.getByRole('button', { name: /算法模板.*打开模板库/ }))
    expect(await screen.findByRole('heading', { level: 1, name: '模板库' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '工作台' }))
    await user.click(screen.getByRole('button', { name: /题目卡片.*打开题目库/ }))
    expect(await screen.findByRole('heading', { level: 1, name: '题目卡片' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '工作台' }))
    await user.click(screen.getByRole('button', { name: /待确认计划.*打开 AI 管理/ }))
    expect(
      await screen.findByRole('heading', { level: 1, name: '总体文件 AI 管理' }),
    ).toBeInTheDocument()
  })

  it('switches the complete interface to English and restores the saved locale', async () => {
    installDesktopMock(workspaceFixture, [problemFixture])
    const user = userEvent.setup()
    const firstRender = render(<App />)

    await screen.findByRole('heading', { level: 1, name: '工作台' })
    await user.click(screen.getByRole('button', { name: '切换到英文界面' }))

    expect(document.documentElement.lang).toBe('en')
    expect(window.localStorage.getItem('ui:locale')).toBe('en')
    expect(screen.getByRole('button', { name: 'Workbench' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Algorithm templates.*Open Templates/ }),
    ).toBeEnabled()

    firstRender.unmount()
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Workbench' })).toBeInTheDocument()
    expect(document.documentElement.lang).toBe('en')
  })
})
