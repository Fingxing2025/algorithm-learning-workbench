import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FileChangeExecution, FileChangePlan } from '@core/contracts/template-management'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { FileManagementWorkspace } from './file-management-workspace'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const planId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const createdAt = '2026-07-20T00:00:00.000Z'

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

const execution: FileChangeExecution = {
  canRollback: true,
  createdAt,
  id: executionId,
  operationCount: 1,
  planId,
  rolledBackAt: createdAt,
  status: 'rolled-back',
}

function installDesktopMock() {
  const archiveFilePlans = vi.fn().mockResolvedValue({ archivedAt: createdAt, planIds: [planId] })
  const deleteFileExecutions = vi.fn().mockResolvedValue({
    deletedAt: createdAt,
    deletedExecutionIds: [executionId],
  })
  const redraftFilePlan = vi
    .fn()
    .mockResolvedValue({ ...plan, id: '44444444-4444-4444-8444-444444444444', status: 'draft' })
  const rollbackFileExecution = vi.fn().mockResolvedValue({ execution, workspace })
  const listFilePlansPage = vi.fn().mockResolvedValue({
    draftCount: 0,
    items: [plan],
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
        archiveFilePlans,
        deleteFileExecutions,
        listFileExecutionsPage,
        listFilePlansPage,
        redraftFilePlan,
        rollbackFileExecution,
      },
    },
  })

  return {
    archiveFilePlans,
    deleteFileExecutions,
    listFileExecutionsPage,
    listFilePlansPage,
    redraftFilePlan,
    rollbackFileExecution,
  }
}

function renderWorkspace() {
  const desktop = installDesktopMock()
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
