import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  FileChangeExecution,
  FileChangeOperation,
  FileChangePlan,
} from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { FileManagementWorkspace } from './file-management-workspace'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const planId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const moveOperationId = '55555555-5555-4555-8555-555555555555'
const deleteOperationId = '66666666-6666-4666-8666-666666666666'
const createdAt = '2026-07-20T00:00:00.000Z'
const templateId = 'a'.repeat(64)

const workspace: WorkspaceSnapshot = {
  available: true,
  id: workspaceId,
  name: '文件管理测试工作区',
  rootPath: '/tmp/file-management-workspace',
  scannedAt: createdAt,
  summary: {
    caseConflictCount: 0,
    issues: [],
    skippedSymlinkCount: 0,
    templateCount: 0,
    truncated: false,
    unsupportedFileCount: 0,
  },
  templatePage: {
    nextAction: null,
    nextCursor: null,
    processedCount: 0,
    totalCount: 0,
    truncated: false,
    truncatedReason: null,
  },
  templates: [],
}

const plan: FileChangePlan = {
  contextVersion: null,
  createdAt,
  diagnostic: {
    auditIssueCount: 0,
    candidateTemplateCount: 0,
    contextTruncated: false,
    notesIncludedCount: 0,
    requestId: null,
    schemaVersion: 2,
  },
  id: planId,
  model: 'fixture-model',
  operations: [],
  outputLanguage: 'zh-CN',
  providerName: 'Fixture Provider',
  status: 'cancelled',
  summary: '',
  updatedAt: createdAt,
}

const operations: FileChangeOperation[] = [
  {
    alternatives: ['保留原目录'],
    applicability: ['目标目录已确认'],
    confidence: 0.91,
    evidence: ['分类层级不一致'],
    id: moveOperationId,
    kind: 'move',
    precondition: null,
    reason: '统一模板分类路径',
    risk: 'medium',
    selectedByDefault: true,
    source: 'local-audit',
    sourcePath: '旧分类/并查集.cpp',
    targetPath: '图论/数据结构/并查集.cpp',
    templateId,
  },
  {
    alternatives: [],
    applicability: [],
    confidence: 0.84,
    evidence: ['规范化源码完全相同'],
    id: deleteOperationId,
    kind: 'delete',
    precondition: null,
    reason: '删除重复副本',
    risk: 'high',
    selectedByDefault: false,
    source: 'ai',
    sourcePath: '副本/并查集-copy.cpp',
    templateId,
  },
]

const draftPlan: FileChangePlan = {
  ...plan,
  operations,
  status: 'draft',
  summary: '先移动主模板，再人工确认重复副本。',
}

const execution: FileChangeExecution = {
  canRollback: true,
  createdAt,
  id: executionId,
  operationCount: 1,
  planId,
  rolledBackAt: createdAt,
  status: 'rolled-back',
}

function installDesktopMock(planItems: FileChangePlan[] = [plan]) {
  const applyFilePlan = vi.fn().mockResolvedValue({ execution, workspace })
  const archiveFilePlans = vi.fn().mockResolvedValue({ archivedAt: createdAt, planIds: [planId] })
  const cancelFilePlan = vi.fn().mockImplementation(async (cancelledPlanId: string) => ({
    ...(planItems.find(item => item.id === cancelledPlanId) ?? plan),
    status: 'cancelled',
  }))
  const deleteFileExecutions = vi.fn().mockResolvedValue({
    deletedAt: createdAt,
    deletedExecutionIds: [executionId],
  })
  const exportFilePlanDiagnostic = vi.fn().mockResolvedValue(true)
  const redraftFilePlan = vi
    .fn()
    .mockResolvedValue({ ...plan, id: '44444444-4444-4444-8444-444444444444', status: 'draft' })
  const rollbackFileExecution = vi.fn().mockResolvedValue({ execution, workspace })
  const listFilePlansPage = vi.fn().mockResolvedValue({
    draftCount: 0,
    items: planItems,
    nextAction: null,
    nextCursor: null,
    processedCount: 1,
    totalCount: 1,
    truncated: false,
    truncatedReason: null,
  })
  const listFileExecutionsPage = vi.fn().mockResolvedValue({
    items: [execution],
    nextAction: null,
    nextCursor: null,
    processedCount: 1,
    totalCount: 1,
    truncated: false,
    truncatedReason: null,
  })

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      templateManagement: {
        applyFilePlan,
        archiveFilePlans,
        cancelFilePlan,
        deleteFileExecutions,
        exportFilePlanDiagnostic,
        listFileExecutionsPage,
        listFilePlansPage,
        redraftFilePlan,
        rollbackFileExecution,
      },
    },
  })

  return {
    applyFilePlan,
    archiveFilePlans,
    cancelFilePlan,
    deleteFileExecutions,
    exportFilePlanDiagnostic,
    listFileExecutionsPage,
    listFilePlansPage,
    redraftFilePlan,
    rollbackFileExecution,
  }
}

function renderWorkspace(planItems?: FileChangePlan[]) {
  const desktop = installDesktopMock(planItems)
  render(
    <FileManagementWorkspace
      onOpenSettings={vi.fn()}
      onWorkspaceChanged={vi.fn()}
      workspace={workspace}
    />,
  )
  return desktop
}

describe('FileManagementWorkspace history actions', () => {
  it('keeps the history region keyboard contract and focuses the selected plan', async () => {
    renderWorkspace()

    const history = await screen.findByRole('region', { name: '文件计划历史列表' })
    fireEvent.keyDown(history, { key: 'End' })
    fireEvent.keyDown(history, { key: 'Enter' })

    expect(screen.getByRole('button', { name: /0 项 · Fixture Provider/ })).toHaveFocus()
  })

  it('requires confirmation before archiving a plan and delegates redrafting', async () => {
    const desktop = renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: /删除计划记录 Fixture Provider/ }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除计划记录' }))
    await waitFor(() =>
      expect(desktop.archiveFilePlans).toHaveBeenCalledWith({ planIds: [planId] }),
    )

    fireEvent.click(screen.getAllByRole('button', { name: '复制为新计划' })[0]!)
    await waitFor(() => expect(desktop.redraftFilePlan).toHaveBeenCalledWith(planId))
  })

  it('confirms rollback and deletion for execution history through the parent callbacks', async () => {
    const desktop = renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: '从备份撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    await waitFor(() => expect(desktop.rollbackFileExecution).toHaveBeenCalledWith(executionId))

    fireEvent.click(screen.getByRole('button', { name: '一键删除执行记录' }))
    fireEvent.click(screen.getByRole('button', { name: '确认删除执行记录' }))
    await waitFor(() =>
      expect(desktop.deleteFileExecutions).toHaveBeenCalledWith({ executionIds: [executionId] }),
    )
  })
})

describe('FileManagementWorkspace plan review', () => {
  it('groups operation diffs and keeps each checkbox state independent', async () => {
    renderWorkspace([draftPlan])

    expect(await screen.findByText('本地审计 · 移动 / 重命名 · 中风险')).toBeInTheDocument()
    expect(screen.getByText('AI 建议 · 删除重复文件 · 高风险')).toBeInTheDocument()
    expect(screen.getByText(/− 旧分类\/并查集\.cpp/)).toHaveTextContent(
      '− 旧分类/并查集.cpp+ 图论/数据结构/并查集.cpp',
    )
    expect(screen.getByText('− 副本/并查集-copy.cpp')).toBeInTheDocument()

    const defaultOperation = screen.getByRole('checkbox', { name: '选择操作 旧分类/并查集.cpp' })
    const manualOperation = screen.getByRole('checkbox', {
      name: '选择操作 副本/并查集-copy.cpp',
    })
    expect(defaultOperation).not.toBeChecked()
    expect(manualOperation).not.toBeChecked()

    fireEvent.click(defaultOperation)
    expect(defaultOperation).toBeChecked()
    expect(manualOperation).not.toBeChecked()
    fireEvent.click(manualOperation)
    expect(defaultOperation).toBeChecked()
    expect(manualOperation).toBeChecked()
  })

  it('keeps zero-operation and no-draft empty states while delegating cancel and diagnostics', async () => {
    const emptyDraft = { ...draftPlan, operations: [] }
    const desktop = renderWorkspace([emptyDraft])

    expect(
      await screen.findByText('AI 没有生成通过本地安全校验的操作。可取消本计划后重试。'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '安全诊断' }))
    await waitFor(() =>
      expect(desktop.exportFilePlanDiagnostic).toHaveBeenCalledWith(emptyDraft.id),
    )

    fireEvent.click(screen.getByRole('button', { name: '取消计划' }))
    await waitFor(() => expect(desktop.cancelFilePlan).toHaveBeenCalledWith(emptyDraft.id))
    expect(await screen.findByText('没有待确认计划')).toBeInTheDocument()
  })

  it('requires a focused second confirmation and applies only the currently selected operations', async () => {
    const desktop = renderWorkspace([draftPlan])

    const manualOperation = await screen.findByRole('checkbox', {
      name: '选择操作 副本/并查集-copy.cpp',
    })
    fireEvent.click(manualOperation)

    const previewApply = screen.getByRole('button', { name: '预览并执行' })
    fireEvent.click(previewApply)
    expect(desktop.applyFilePlan).not.toHaveBeenCalled()

    const confirmApply = screen.getByRole('button', { name: '确认执行' })
    await waitFor(() => expect(confirmApply).toHaveFocus())
    expect(screen.getByText('将备份后执行 {count} 项操作')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    const returnedPreviewApply = screen.getByRole('button', { name: '预览并执行' })
    await waitFor(() => expect(returnedPreviewApply).toHaveFocus())
    fireEvent.click(returnedPreviewApply)
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }))

    await waitFor(() =>
      expect(desktop.applyFilePlan).toHaveBeenCalledWith({
        operationIds: [deleteOperationId],
        planId,
      }),
    )
  })
})
