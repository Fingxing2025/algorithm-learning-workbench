import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type {
  FileChangeExecution,
  FileChangeOperation,
  FileChangePlan,
  InvalidFileExecutionItem,
  WorkspaceAudit,
} from '@core/contracts/template-management'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type { WorkspaceSnapshot } from '@core/contracts/workspace'

import { I18nProvider } from '@/lib/i18n'

import { FileManagementWorkspace } from './file-management-workspace'

const workspaceId = '11111111-1111-4111-8111-111111111111'
const planId = '22222222-2222-4222-8222-222222222222'
const executionId = '33333333-3333-4333-8333-333333333333'
const planDeletePreviewId = '33333333-3333-4333-8333-333333333334'
const executionDeletePreviewId = '33333333-3333-4333-8333-333333333335'
const invalidExecutionPreviewId = '33333333-3333-4333-8333-333333333337'
const moveOperationId = '55555555-5555-4555-8555-555555555555'
const deleteOperationId = '66666666-6666-4666-8666-666666666666'
const metadataOperationId = '66666666-6666-4666-8666-666666666667'
const auditTaskId = '77777777-7777-4777-8777-777777777777'
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
    adaptiveSplitCount: 0,
    auditIssueCount: 0,
    candidateTemplateCount: 0,
    contextTruncated: false,
    effectiveBatchCount: 0,
    inputHash: null,
    initialBatchCount: 0,
    languageFallbackBatchCount: 0,
    notesIncludedCount: 0,
    previewId: null,
    requestId: null,
    schemaVersion: 2,
    sourceReadFailureCount: 0,
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
    alternatives: ['保留旧元数据'],
    applicability: ['人工确认算法卡片字段'],
    confidence: 0.8,
    evidence: ['源码与元数据不一致'],
    id: metadataOperationId,
    kind: 'update-metadata',
    metadata: {
      commonMistakes: '新错误',
      constraints: '新约束',
      notes: '新笔记',
      prerequisites: '新前置',
      solves: '新用途',
      spaceComplexity: 'O(n)',
      tags: ['新标签'],
      timeComplexity: 'O(n log n)',
    },
    precondition: null,
    previousMetadata: {
      commonMistakes: '旧错误',
      constraints: '旧约束',
      notes: '旧笔记',
      prerequisites: '旧前置',
      solves: '旧用途',
      spaceComplexity: 'O(1)',
      tags: ['旧标签'],
      timeComplexity: 'O(n²)',
    },
    reason: '补全全部算法元数据',
    risk: 'high',
    selectedByDefault: false,
    source: 'ai',
    sourcePath: '图论/元数据.cpp',
    templateId: 'b'.repeat(64),
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

const appliedExecution: FileChangeExecution = {
  ...execution,
  canRollback: true,
  id: '33333333-3333-4333-8333-333333333336',
  rolledBackAt: null,
  status: 'applied',
}

const invalidExecution: InvalidFileExecutionItem = {
  createdAt,
  deletable: true,
  id: appliedExecution.id,
  operationCount: null,
  reason: 'backup-missing',
  workspaceId: '11111111-1111-4111-8111-111111111112',
  workspaceName: '旧工作区',
}

const emptyAudit: WorkspaceAudit = {
  generatedAt: createdAt,
  issues: [],
  nextAction: null,
  processedCount: 0,
  templateCount: 0,
  totalCount: 0,
  truncated: false,
  truncatedReason: null,
}

const completedAudit: WorkspaceAudit = {
  ...emptyAudit,
  issues: [
    {
      detail: '重复源码',
      id: '88888888-8888-4888-8888-888888888888',
      kind: 'duplicate-content',
      paths: ['图论/并查集.cpp', '副本/并查集.cpp'],
      severity: 'warning',
    },
    {
      detail: '失效关联',
      id: '99999999-9999-4999-8999-999999999999',
      kind: 'stale-relation',
      paths: ['旧目录/失效模板.cpp'],
      severity: 'info',
    },
    {
      detail: '文件名疑似包含乱码或错误解码痕迹；AI 文件计划必须提供安全改名，执行前仍需确认。',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      kind: 'invalid-name',
      paths: ['图论/锟斤拷.cpp'],
      severity: 'warning',
    },
  ],
  processedCount: 3,
  templateCount: 3,
  totalCount: 3,
}

const truncatedAudit: WorkspaceAudit = {
  ...emptyAudit,
  issues: Array.from({ length: 41 }, (_, index) => ({
    detail: `命名异常 ${index}`,
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    kind: 'invalid-name' as const,
    paths: [`审计/issue-${index}.cpp`],
    severity: 'warning' as const,
  })),
  nextAction: '请缩小工作区范围后再次扫描。',
  processedCount: 41,
  templateCount: 60,
  totalCount: 60,
  truncated: true,
  truncatedReason: '达到审计安全上限。\n还有更多建议未展示。',
}

function completedAuditTask(audit: WorkspaceAudit): BackgroundTaskStatus {
  return {
    error: null,
    finishedAt: createdAt,
    id: auditTaskId,
    kind: 'workspace-audit',
    progress: {
      phase: 'finalizing',
      processedCount: audit.processedCount,
      totalCount: audit.totalCount,
    },
    result: { audit, kind: 'workspace-audit' },
    startedAt: createdAt,
    state: 'completed',
  }
}

const cancelledAuditTask: BackgroundTaskStatus = {
  error: null,
  finishedAt: createdAt,
  id: auditTaskId,
  kind: 'workspace-audit',
  progress: { phase: 'similarity', processedCount: 2, totalCount: 6 },
  result: null,
  startedAt: createdAt,
  state: 'cancelled',
}

const runningAuditTask: BackgroundTaskStatus = {
  ...cancelledAuditTask,
  finishedAt: null,
  state: 'running',
}

function installDesktopMock(
  planItems: FileChangePlan[] = [plan],
  auditStartStatus: BackgroundTaskStatus = completedAuditTask(emptyAudit),
  executionItems: FileChangeExecution[] = [execution],
  invalidExecutionItems: InvalidFileExecutionItem[] = [],
) {
  const previewFilePlan = vi.fn().mockImplementation(async request => ({
    capabilities: {
      promptCaching: true,
      streaming: false,
      structuredOutput: true,
      vision: false,
    },
    cache: {
      eligible: true,
      key: 'fixture-cache-key',
      workspaceContextVersion: 'fixture-context-version',
    },
    endpointHost: 'fixture.invalid',
    estimatedInputTokens: 1234,
    filePlan: {
      auditIssueCount: 2,
      batchCount: 2,
      candidateMetadataOmitted: false,
      candidateSourceOmitted: true,
      candidateTemplateCount: 3,
      detailedCandidateCount: 3,
      expiresAt: '2026-07-23T00:05:00.000Z',
      inputCharacters: 4936,
      inputHash: 'a'.repeat(64),
      largestBatchInputCharacters: 2600,
      maxCandidatesPerBatch: 4,
      maxOutputTokensPerBatch: 4096,
      metadataCharacters: 420,
      notesCharacters: request.includeNotes ? 18 : 0,
      notesIncludedCount: request.includeNotes ? 2 : 0,
      previewId: '40000000-0000-4000-8000-000000000099',
      sourceCharacters: 800,
      sourceReadFailureCount: 1,
      sourceSnippetCount: 2,
      totalBatchInputCharacters: 4936,
    },
    items: [],
    model: 'fixture-model',
    outputLanguage: request.outputLanguage,
    protocol: 'openai-chat-completions',
    providerName: 'Fixture Provider',
    task: 'workspace-management',
    truncated: true,
    workspaceCatalog: {
      directoryCount: 4,
      estimatedInputTokens: 800,
      relatedSourceCharacters: 0,
      relatedSourceTemplateCount: 0,
      schemaVersion: 1,
      sentTemplateNameCount: 3,
      sourceSnippetsOmitted: true,
      summarizedTemplateCount: 3,
      summaryShortened: false,
      supplementalMetadataOmitted: false,
      templateCount: 3,
      templateNamesTruncated: false,
    },
  }))
  const generateFilePlan = vi.fn().mockResolvedValue(draftPlan)
  const cancelFilePlanGeneration = vi.fn().mockResolvedValue(undefined)
  const applyFilePlan = vi.fn().mockResolvedValue({ execution, workspace })
  const cancelFilePlan = vi.fn().mockImplementation(async (cancelledPlanId: string) => ({
    ...(planItems.find(item => item.id === cancelledPlanId) ?? plan),
    status: 'cancelled',
  }))
  const deleteFileExecutions = vi.fn().mockResolvedValue({
    cleanupPending: false,
    deletedAt: createdAt,
    deletedBackupDirectoryCount: 0,
    deletedExecutionCount: 1,
    deletedPlanCount: 0,
    kind: 'executions',
    missingBackupDirectoryCount: 1,
    recordIds: [executionId],
  })
  const deleteFilePlans = vi.fn().mockResolvedValue({
    cleanupPending: false,
    deletedAt: createdAt,
    deletedBackupDirectoryCount: 0,
    deletedExecutionCount: 0,
    deletedPlanCount: 1,
    kind: 'plans',
    missingBackupDirectoryCount: 0,
    recordIds: [planId],
  })
  const deleteInvalidFileExecutions = vi.fn().mockResolvedValue({
    deletedAt: createdAt,
    deletedExecutionCount: invalidExecutionItems.length,
    recordIds: invalidExecutionItems.map(item => item.id),
  })
  const previewDeleteFileExecutions = vi.fn().mockImplementation(async request => {
    const selected = executionItems.filter(item => request.executionIds.includes(item.id))
    return {
      appliedExecutionCount: selected.filter(item => item.status === 'applied').length,
      appliedPlanCount: 0,
      backupDirectoryCount: 0,
      cancelledPlanCount: 0,
      executionCount: selected.length,
      expiresAt: '2026-07-20T00:10:00.000Z',
      kind: 'executions',
      missingBackupDirectoryCount: 1,
      planCount: 0,
      previewId: executionDeletePreviewId,
      recordIds: request.executionIds,
      rolledBackExecutionCount: selected.filter(item => item.status === 'rolled-back').length,
      rolledBackPlanCount: 0,
    }
  })
  const previewDeleteFilePlans = vi.fn().mockResolvedValue({
    appliedExecutionCount: 0,
    appliedPlanCount: 0,
    backupDirectoryCount: 0,
    cancelledPlanCount: 1,
    executionCount: 0,
    expiresAt: '2026-07-20T00:10:00.000Z',
    kind: 'plans',
    missingBackupDirectoryCount: 0,
    planCount: 1,
    previewId: planDeletePreviewId,
    recordIds: [planId],
    rolledBackExecutionCount: 0,
    rolledBackPlanCount: 0,
  })
  const previewDeleteInvalidFileExecutions = vi.fn().mockImplementation(async request => {
    const selected = invalidExecutionItems.filter(item => request.executionIds.includes(item.id))
    return {
      executionCount: selected.length,
      expiresAt: '2026-07-20T00:10:00.000Z',
      items: selected,
      previewId: invalidExecutionPreviewId,
      recordIds: selected.map(item => item.id),
      workspaceCount: new Set(selected.map(item => item.workspaceId)).size,
    }
  })
  const exportFilePlanDiagnostic = vi.fn().mockResolvedValue(true)
  const cancelBackgroundTask = vi.fn().mockResolvedValue(cancelledAuditTask)
  const getBackgroundTask = vi.fn().mockResolvedValue(cancelledAuditTask)
  const redraftFilePlan = vi
    .fn()
    .mockResolvedValue({ ...plan, id: '44444444-4444-4444-8444-444444444444', status: 'draft' })
  const rollbackFileExecution = vi.fn().mockResolvedValue({ execution, workspace })
  const startAudit = vi.fn().mockResolvedValue(auditStartStatus)
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
    items: executionItems,
    nextAction: null,
    nextCursor: null,
    processedCount: executionItems.length,
    totalCount: executionItems.length,
    truncated: false,
    truncatedReason: null,
  })
  const listInvalidFileExecutionsPage = vi.fn().mockResolvedValue({
    items: invalidExecutionItems,
    nextAction: null,
    nextCursor: null,
    processedCount: invalidExecutionItems.length,
    totalCount: invalidExecutionItems.length,
    truncated: false,
    truncatedReason: null,
  })

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      backgroundTasks: {
        cancel: cancelBackgroundTask,
        get: getBackgroundTask,
      },
      templateManagement: {
        applyFilePlan,
        cancelFilePlanGeneration,
        cancelFilePlan,
        deleteFileExecutions,
        deleteInvalidFileExecutions,
        deleteFilePlans,
        exportFilePlanDiagnostic,
        generateFilePlan,
        listFileExecutionsPage,
        listInvalidFileExecutionsPage,
        listFilePlansPage,
        previewDeleteFileExecutions,
        previewDeleteInvalidFileExecutions,
        previewDeleteFilePlans,
        previewFilePlan,
        redraftFilePlan,
        rollbackFileExecution,
        startAudit,
      },
    },
  })

  return {
    applyFilePlan,
    cancelFilePlanGeneration,
    cancelBackgroundTask,
    cancelFilePlan,
    deleteFileExecutions,
    deleteInvalidFileExecutions,
    deleteFilePlans,
    exportFilePlanDiagnostic,
    generateFilePlan,
    getBackgroundTask,
    listFileExecutionsPage,
    listInvalidFileExecutionsPage,
    listFilePlansPage,
    previewDeleteFileExecutions,
    previewDeleteInvalidFileExecutions,
    previewDeleteFilePlans,
    previewFilePlan,
    redraftFilePlan,
    rollbackFileExecution,
    startAudit,
  }
}

function renderWorkspace(
  planItems?: FileChangePlan[],
  auditStartStatus?: BackgroundTaskStatus,
  executionItems?: FileChangeExecution[],
  invalidExecutionItems?: InvalidFileExecutionItem[],
) {
  const desktop = installDesktopMock(
    planItems,
    auditStartStatus,
    executionItems,
    invalidExecutionItems,
  )
  render(
    <I18nProvider>
      <FileManagementWorkspace
        onOpenSettings={vi.fn()}
        onWorkspaceChanged={vi.fn()}
        workspace={workspace}
      />
    </I18nProvider>,
  )
  return desktop
}

describe('FileManagementWorkspace history actions', () => {
  it('shows cross-workspace invalid records even when current execution history is empty and cleans only selected items', async () => {
    const desktop = renderWorkspace(
      undefined,
      completedAuditTask(emptyAudit),
      [],
      [invalidExecution],
    )

    expect(await screen.findByRole('heading', { name: '失效执行记录' })).toBeInTheDocument()
    expect(screen.getByText('暂无文件执行记录。')).toBeInTheDocument()
    const selection = screen.getByRole('checkbox', { name: '选择失效执行记录 旧工作区' })
    expect(selection).not.toBeChecked()
    expect(screen.getByRole('button', { name: /清理所选失效记录/ })).toBeDisabled()

    fireEvent.click(selection)
    fireEvent.click(screen.getByRole('button', { name: /清理所选失效记录/ }))
    await waitFor(() =>
      expect(desktop.previewDeleteInvalidFileExecutions).toHaveBeenCalledWith({
        executionIds: [invalidExecution.id],
      }),
    )
    const confirm = await screen.findByRole('button', { name: '确认清理失效记录' })
    await waitFor(() => expect(confirm).toHaveFocus())
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(desktop.deleteInvalidFileExecutions).toHaveBeenCalledWith({
        confirmed: true,
        previewId: invalidExecutionPreviewId,
        requestId: expect.any(String),
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      '已清理 1 条失效执行记录；当前工作区文件未修改。',
    )
  })

  it('blocks rollback and ordinary history deletion for an invalid current-workspace execution', async () => {
    renderWorkspace(
      undefined,
      completedAuditTask(emptyAudit),
      [
        {
          ...appliedExecution,
          canRollback: false,
          rollbackIssue: 'backup-missing',
        },
      ],
      [invalidExecution],
    )

    expect(
      await screen.findByText('撤销备份已缺失，请在上方失效执行记录中处理。'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '从备份撤销' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /永久删除执行记录/ })).not.toBeInTheDocument()
  })

  it('keeps the history region keyboard contract and focuses the selected plan', async () => {
    renderWorkspace()

    const history = await screen.findByRole('region', { name: '文件计划历史列表' })
    fireEvent.keyDown(history, { key: 'End' })
    fireEvent.keyDown(history, { key: 'Enter' })

    expect(screen.getByRole('button', { name: /0 项 · Fixture Provider/ })).toHaveFocus()
  })

  it('requires a Main preview before permanently deleting a plan and delegates redrafting', async () => {
    const desktop = renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: /删除计划记录 Fixture Provider/ }))
    fireEvent.click(await screen.findByRole('button', { name: '确认永久删除计划记录' }))
    await waitFor(() =>
      expect(desktop.previewDeleteFilePlans).toHaveBeenCalledWith({ planIds: [planId] }),
    )
    expect(desktop.deleteFilePlans).toHaveBeenCalledWith({
      confirmed: true,
      previewId: planDeletePreviewId,
      requestId: expect.any(String),
    })
    await screen.findByText(/已永久删除 1 份计划/)

    const redraft = screen.getAllByRole('button', { name: '复制为新计划' })[0]!
    await waitFor(() => expect(redraft).toBeEnabled())
    fireEvent.click(redraft)
    await waitFor(() => expect(desktop.redraftFilePlan).toHaveBeenCalledWith(planId))
  })

  it('confirms rollback and deletion for execution history through the parent callbacks', async () => {
    const desktop = renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: '从备份撤销' }))
    fireEvent.click(screen.getByRole('button', { name: '确认撤销' }))
    await waitFor(() =>
      expect(desktop.rollbackFileExecution).toHaveBeenCalledWith(executionId, expect.any(String)),
    )
    await screen.findByText('已从备份撤销文件计划。')

    const deleteExecution = screen.getByRole('button', { name: '一键删除执行记录' })
    await waitFor(() => expect(deleteExecution).toBeEnabled())
    fireEvent.click(deleteExecution)
    fireEvent.click(await screen.findByRole('button', { name: '确认永久删除执行记录' }))
    await waitFor(() =>
      expect(desktop.previewDeleteFileExecutions).toHaveBeenCalledWith({
        executionIds: [executionId],
      }),
    )
    expect(desktop.deleteFileExecutions).toHaveBeenCalledWith({
      confirmed: true,
      previewId: executionDeletePreviewId,
      requestId: expect.any(String),
    })
  })

  it('offers permanent deletion for applied executions', async () => {
    const desktop = renderWorkspace([plan], completedAuditTask(emptyAudit), [appliedExecution])

    const deleteExecution = screen.getByRole('button', { name: '一键删除执行记录' })
    await waitFor(() => expect(deleteExecution).toBeEnabled())
    fireEvent.click(deleteExecution)
    expect(await screen.findByText(/1 条执行记录：1 条已执行、0 条已撤销/)).toBeInTheDocument()
    await waitFor(() =>
      expect(desktop.previewDeleteFileExecutions).toHaveBeenCalledWith({
        executionIds: [appliedExecution.id],
      }),
    )
  })
})

describe('FileManagementWorkspace plan review', () => {
  it('keeps user notes off by default and shows the locked snapshot statistics', async () => {
    const desktop = renderWorkspace([])

    const notesToggle = await screen.findByRole('checkbox', {
      name: '允许发送模板用户笔记',
    })
    expect(notesToggle).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 计划' }))
    await waitFor(() =>
      expect(desktop.previewFilePlan).toHaveBeenCalledWith(
        expect.objectContaining({ includeNotes: false, outputLanguage: 'zh-CN' }),
      ),
    )
    expect(await screen.findByRole('region', { name: '完整工作区目录覆盖' })).toHaveTextContent(
      '3 / 3',
    )
    expect(screen.getByRole('region', { name: '文件计划发送快照' })).toHaveTextContent(
      '详细候选3 / 3',
    )
    expect(screen.getByRole('region', { name: '文件计划发送快照' })).toHaveTextContent(
      '单批候选上限4',
    )
    expect(screen.getByRole('region', { name: '文件计划发送快照' })).toHaveTextContent(
      '单批输出上限4,096 Token',
    )
    expect(screen.getByRole('region', { name: '文件计划发送快照' })).toHaveTextContent(
      '用户笔记0 · 0 字符',
    )
    expect(screen.getByText(/完整目录、模板 ID、名称、相对路径和语言仍全部保留/)).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: '返回修改' }))
    fireEvent.click(notesToggle)
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 计划' }))
    await waitFor(() =>
      expect(desktop.previewFilePlan).toHaveBeenLastCalledWith(
        expect.objectContaining({ includeNotes: true, outputLanguage: 'zh-CN' }),
      ),
    )
    expect(await screen.findByRole('region', { name: '文件计划发送快照' })).toHaveTextContent(
      '用户笔记2 · 18 字符',
    )
  })

  it('does not claim complete catalog preservation without catalog evidence', async () => {
    const desktop = renderWorkspace([])
    const previewWithoutCatalog = await desktop.previewFilePlan({
      includeNotes: false,
      outputLanguage: 'zh-CN',
    })
    desktop.previewFilePlan.mockReset().mockResolvedValueOnce({
      ...previewWithoutCatalog,
      workspaceCatalog: undefined,
    })

    fireEvent.click(await screen.findByRole('button', { name: '生成 AI 计划' }))

    expect(
      await screen.findByText('已按安全预算缩减部分可选上下文；请检查上方覆盖统计。'),
    ).toBeVisible()
    expect(
      screen.queryByText(/完整目录、模板 ID、名称、相对路径和语言仍全部保留/),
    ).not.toBeInTheDocument()
  })

  it('groups operation diffs and keeps each checkbox state independent', async () => {
    renderWorkspace([draftPlan])

    expect(await screen.findByText('本地审计 · 移动 / 重命名 · 中风险')).toBeInTheDocument()
    expect(screen.getByText('AI 建议 · 删除重复文件 · 高风险')).toBeInTheDocument()
    expect(screen.getByText(/− 旧分类\/并查集\.cpp/)).toHaveTextContent(
      '− 旧分类/并查集.cpp+ 图论/数据结构/并查集.cpp',
    )
    expect(screen.getByText('− 副本/并查集-copy.cpp')).toBeInTheDocument()
    for (const [oldValue, newValue] of [
      ['旧用途', '新用途'],
      ['旧约束', '新约束'],
      ['旧前置', '新前置'],
      ['旧错误', '新错误'],
      ['O(n²)', 'O(n log n)'],
      ['O(1)', 'O(n)'],
      ['旧标签', '新标签'],
      ['旧笔记', '新笔记'],
    ]) {
      expect(screen.getByText(`− ${oldValue}`)).toBeInTheDocument()
      expect(screen.getByText(`+ ${newValue}`)).toBeInTheDocument()
    }
    expect(screen.getByText('用户笔记').parentElement).toHaveTextContent('高风险')

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
    expect(screen.getByText('将备份后执行 1 项操作')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    const returnedPreviewApply = screen.getByRole('button', { name: '预览并执行' })
    await waitFor(() => expect(returnedPreviewApply).toHaveFocus())
    fireEvent.click(returnedPreviewApply)
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }))

    await waitFor(() =>
      expect(desktop.applyFilePlan).toHaveBeenCalledWith({
        operationIds: [deleteOperationId],
        planId,
        requestId: expect.any(String),
      }),
    )
  })
})

describe('FileManagementWorkspace audit display', () => {
  it('shows active progress and delegates cancellation through the parent task call', async () => {
    const desktop = renderWorkspace(undefined, runningAuditTask)

    fireEvent.click(screen.getByRole('button', { name: '只读扫描' }))
    expect(await screen.findByText(/已处理 2 \/ 6/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '取消审计' }))

    await waitFor(() =>
      expect(desktop.cancelBackgroundTask).toHaveBeenCalledWith({ taskId: auditTaskId }),
    )
    expect(desktop.startAudit).toHaveBeenCalledWith({ requestId: expect.any(String) })
  })

  it('renders audit issue categories, paths, and deterministic guidance', async () => {
    renderWorkspace(undefined, completedAuditTask(completedAudit))

    fireEvent.click(screen.getByRole('button', { name: '只读扫描' }))

    expect(await screen.findByText('完全重复')).toBeInTheDocument()
    expect(screen.getByText('图论/并查集.cpp、副本/并查集.cpp')).toBeInTheDocument()
    expect(
      screen.getByText('这些模板源码规范化后完全相同；建议仅保留 图论/并查集.cpp。'),
    ).toBeInTheDocument()
    expect(screen.getByText('失效关联')).toBeInTheDocument()
    expect(screen.getByText('模板关联指向当前不可用的模板。')).toBeInTheDocument()
    expect(screen.getByText('命名异常')).toBeInTheDocument()
    expect(
      screen.getByText(
        '文件名疑似包含乱码或错误解码痕迹；AI 文件计划必须提供安全改名，执行前仍需确认。',
      ),
    ).toBeInTheDocument()
  })

  it('keeps the empty result and truncated 40-item display boundary', async () => {
    const desktop = renderWorkspace(undefined, completedAuditTask(emptyAudit))

    fireEvent.click(screen.getByRole('button', { name: '只读扫描' }))
    expect(await screen.findByText('未发现确定性问题。')).toBeInTheDocument()

    desktop.startAudit.mockResolvedValueOnce(completedAuditTask(truncatedAudit))
    fireEvent.click(screen.getByRole('button', { name: '只读扫描' }))

    expect(await screen.findByText(/达到审计安全上限。/)).toHaveTextContent(
      '达到审计安全上限。 还有更多建议未展示。',
    )
    expect(screen.getByText('请缩小工作区范围后再次扫描。')).toBeInTheDocument()
    expect(screen.getByText('已展示 40 / 41')).toBeInTheDocument()
    expect(screen.getByText('审计/issue-39.cpp')).toBeInTheDocument()
    expect(screen.queryByText('审计/issue-40.cpp')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }))
    expect(screen.getByText('审计/issue-40.cpp')).toBeInTheDocument()
    expect(screen.getByText('已展示 41 / 41')).toBeInTheDocument()
  })
})
