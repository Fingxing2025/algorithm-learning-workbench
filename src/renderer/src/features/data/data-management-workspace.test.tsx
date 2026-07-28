import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  BackupExportResult,
  BackupLifecycleInventory,
  BackupManifestV2,
  BackupVerification,
  DataDiagnostics,
  InterruptedRecoveryPreview,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'

import { I18nProvider } from '@/lib/i18n'

import { DataManagementWorkspace } from './data-management-workspace'

const checkedAt = '2026-07-21T00:00:00.000Z'
const counts = {
  aiProviderProfiles: 0,
  aiTaskRoutes: 0,
  batchImportBackupDirectories: 0,
  fileChangeExecutions: 2,
  fileChangePlans: 3,
  filePlanBackupDirectories: 0,
  problemImages: 4,
  problemImageFiles: 4,
  problems: 2,
  templateMetadata: 3,
  templateProblemRelations: 1,
  templates: 3,
  workspaces: 1,
}

const diagnostics: DataDiagnostics = {
  checkedAt,
  counts,
  database: { foreignKeyOk: true, quickCheck: 'ok', walPresent: true },
  issues: [],
  storage: [{ bytes: 4096, key: 'user-data-total' }],
}

const manifest: BackupManifestV2 = {
  appVersion: '0.1.2',
  archive: {
    container: 'zip',
    entryNameEncoding: 'utf-8',
    pathNormalization: 'NFC',
    separator: '/',
  },
  completed: true,
  counts,
  createdAt: checkedAt,
  createdOn: 'darwin',
  diagnostics,
  files: [
    {
      bytes: 512,
      path: 'data/sqlite/algorithm-workbench.sqlite',
      sha256: 'a'.repeat(64),
    },
  ],
  formatVersion: 'v2',
  includeTemplateSources: true,
  packageId: '11111111-1111-4111-8111-111111111111',
  portability: {
    caseInsensitivePathSafe: true,
    sourceBytesPreserved: true,
    windowsPathSafe: true,
  },
  privacy: { excluded: ['provider-secrets'], providerSecrets: 'omitted' },
  sqlite: { foreignKeyOk: true, quickCheck: 'ok', sanitizedProviderSecrets: true },
  workspaces: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      name: '算法模板',
      templateFileCount: 3,
    },
  ],
}

const verification: BackupVerification = {
  checkedAt,
  errors: [],
  manifest,
  ok: true,
  packagePath: '/tmp/algorithm-workbench-backup.awb-backup',
}

const exportResult: BackupExportResult = {
  manifest,
  packagePath: verification.packagePath!,
  verification,
}

const restorePreview: RestorePreview = {
  canRestore: true,
  conflicts: [],
  manifest,
  sourceWorkspace: manifest.workspaces[0]!,
  targetCounts: {
    ...counts,
    fileChangeExecutions: 8,
    fileChangePlans: 7,
    problemImages: 6,
    problems: 5,
    templateProblemRelations: 4,
    templates: 9,
    workspaces: 2,
  },
  targetWorkspace: {
    id: '44444444-4444-4444-8444-444444444444',
    name: '当前工作区 B',
    templateFileCount: 9,
  },
  verification,
}

const restoreResult: RestoreBackupResult = {
  preflightBackupPath: '/tmp/preflight-backup.awb-backup',
  providerSecretsNeedReentry: false,
  restoredCounts: counts,
  restoredTemplateSourceFiles: 3,
}

const interruptedOperationId = 'b'.repeat(64)
const protectedInterruptedOperationId = 'c'.repeat(64)

const lifecycle: BackupLifecycleInventory = {
  areas: [],
  candidates: [],
  checkedAt,
  interruptedOperationCount: 0,
  interruptedOperations: [],
  quarantineOperations: [],
  quarantinableBytes: 0,
  retentionPolicy: 'forever',
  schemaVersion: 1,
  totalManagedBytes: 0,
}

const lifecycleWithInterrupted: BackupLifecycleInventory = {
  ...lifecycle,
  interruptedOperationCount: 2,
  interruptedOperations: [
    {
      action: 'restore-preflight',
      bytes: 2048,
      canRecover: true,
      createdAt: checkedAt,
      id: interruptedOperationId,
      kind: 'restore-operation',
      reason: 'restore-preflight-ready',
    },
    {
      action: 'none',
      bytes: 1024,
      canRecover: false,
      createdAt: checkedAt,
      id: protectedInterruptedOperationId,
      kind: 'unknown',
      reason: 'journal-invalid',
    },
  ],
}

const interruptedPreview: InterruptedRecoveryPreview = {
  canExecute: true,
  checkedAt,
  errors: [],
  operation: lifecycleWithInterrupted.interruptedOperations[0]!,
}

function installDesktopMock({
  diagnosticsResult = diagnostics,
  interruptedPreviewResult = interruptedPreview,
  lifecycleResult = lifecycle,
}: {
  diagnosticsResult?: DataDiagnostics
  interruptedPreviewResult?: InterruptedRecoveryPreview
  lifecycleResult?: BackupLifecycleInventory
} = {}) {
  const diagnose = vi.fn().mockResolvedValue(diagnosticsResult)
  const exportBackup = vi.fn().mockResolvedValue(exportResult)
  const inspectBackupLifecycle = vi.fn().mockResolvedValue(lifecycleResult)
  const previewInterruptedRecovery = vi.fn().mockResolvedValue(interruptedPreviewResult)
  const previewRestore = vi.fn().mockResolvedValue(restorePreview)
  const recoverInterruptedOperation = vi.fn().mockResolvedValue({
    action: 'restore-preflight',
    inventory: lifecycle,
    operationId: interruptedOperationId,
  })
  const restoreBackup = vi.fn().mockResolvedValue(restoreResult)

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      dataManagement: {
        diagnose,
        exportBackup,
        inspectBackupLifecycle,
        previewInterruptedRecovery,
        previewRestore,
        recoverInterruptedOperation,
        restoreBackup,
      },
      workspace: {
        getCurrent: vi.fn().mockResolvedValue({
          available: true,
          id: manifest.workspaces[0]!.id,
          name: manifest.workspaces[0]!.name,
          rootPath: '/tmp/current-workspace-b/templates',
          scannedAt: checkedAt,
          summary: {
            caseConflictCount: 0,
            scanTruncated: false,
            skippedSymlinkCount: 0,
            templateCount: 3,
            unsupportedFileCount: 0,
          },
          templatePage: {
            nextAction: null,
            nextCursor: null,
            processedCount: 3,
            totalCount: 3,
            truncated: false,
            truncatedReason: null,
          },
          templates: [],
        }),
      },
    },
  })

  return {
    diagnose,
    exportBackup,
    inspectBackupLifecycle,
    previewInterruptedRecovery,
    previewRestore,
    recoverInterruptedOperation,
    restoreBackup,
  }
}

function renderWorkspace(onNavigateToAiManagement = vi.fn()) {
  render(
    <I18nProvider>
      <DataManagementWorkspace
        onNavigateToAiManagement={onNavigateToAiManagement}
        onWorkspaceRestored={vi.fn()}
      />
    </I18nProvider>,
  )
}

describe('DataManagementWorkspace primary backup and restore flow', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows only the essential normal-page functions and reads lifecycle without changing data', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: '备份与恢复' })).toBeInTheDocument()
    expect(screen.getByText('数据状态正常')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '当前工作区备份' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '恢复备份' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导出当前工作区备份' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '选择备份并恢复' })).toBeEnabled()
    expect(screen.getByText('完整深拷贝')).toBeInTheDocument()
    expect(screen.queryByLabelText('包含模板源码')).not.toBeInTheDocument()

    expect(screen.queryByText('备份生命周期')).not.toBeInTheDocument()
    expect(screen.queryByText('备份保留策略')).not.toBeInTheDocument()
    expect(screen.queryByText('选择全部可隔离项')).not.toBeInTheDocument()
    expect(screen.queryByText('SQLite 状态')).not.toBeInTheDocument()
    expect(screen.queryByText('WAL')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '历史隔离数据' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '上一次数据操作未完成' })).not.toBeInTheDocument()
    expect(desktop.inspectBackupLifecycle).toHaveBeenCalledWith({ retentionPolicy: 'forever' })
  })

  it('exports the current workspace backup with template sources by default', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: '导出当前工作区备份' }))

    await waitFor(() =>
      expect(desktop.exportBackup).toHaveBeenCalledWith({
        includeTemplateSources: true,
        requestId: expect.any(String),
      }),
    )
    expect(await screen.findByText('当前工作区备份已导出并通过校验')).toBeInTheDocument()
    expect(screen.getByText('文件数量: 1 · 格式版本: v2')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('备份已导出并通过校验。')
  })

  it('navigates to AI management for missing file execution backups without deleting data', async () => {
    const onNavigateToAiManagement = vi.fn()
    const desktop = installDesktopMock({
      diagnosticsResult: {
        ...diagnostics,
        issues: [{ count: 1, kind: 'file-execution-backup-missing', severity: 'error' }],
      },
    })
    renderWorkspace(onNavigateToAiManagement)

    fireEvent.click(await screen.findByRole('button', { name: '前往 AI 管理处理失效执行记录' }))

    expect(onNavigateToAiManagement).toHaveBeenCalledTimes(1)
    expect(desktop.diagnose).toHaveBeenCalledTimes(1)
  })

  it('automatically verifies selection, compares complete counts, and restores only after confirmation', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: '选择备份并恢复' }))

    await waitFor(() =>
      expect(desktop.previewRestore).toHaveBeenCalledWith({
        requestId: expect.any(String),
      }),
    )
    expect(await screen.findByText('备份检查通过，可以恢复')).toBeInTheDocument()
    expect(screen.getByText('已自动验证备份完整性。')).toBeInTheDocument()
    expect(
      screen.getByText(
        '恢复会把备份内容深拷贝到当前工作区；不会修改来源或其他工作区，也不是合并操作。',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('当前工作区 B')).toBeInTheDocument()
    expect(screen.getAllByTestId(/^restore-count-/)).toHaveLength(6)
    expect(screen.getByTestId('restore-source-workspace')).toHaveTextContent('算法模板')
    expect(screen.getByTestId('restore-target-workspace')).toHaveTextContent('当前工作区 B')
    expect(screen.getByTestId('restore-count-templates')).toHaveTextContent('模板93')
    expect(screen.getByTestId('restore-count-fileChangePlans')).toHaveTextContent('文件计划73')

    const confirmation = screen.getByLabelText('我了解恢复会替换当前工作区，并确认继续。')
    await waitFor(() => expect(confirmation).toHaveFocus())
    expect(screen.getByRole('button', { name: '确认恢复' })).toBeDisabled()

    fireEvent.click(confirmation)
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))

    await waitFor(() =>
      expect(desktop.restoreBackup).toHaveBeenCalledWith({
        confirmRestore: true,
        expectedSourceWorkspaceId: manifest.workspaces[0]!.id,
        expectedTargetWorkspaceId: restorePreview.targetWorkspace.id,
        packagePath: '/tmp/algorithm-workbench-backup.awb-backup',
        requestId: expect.any(String),
      }),
    )
    expect(await screen.findByText('恢复完成')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '当前工作区恢复完成；其他工作区和 Provider 配置未修改。',
    )
    expect(desktop.diagnose).toHaveBeenCalledTimes(2)
  })
})

describe('DataManagementWorkspace conditional compatibility flows', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows user-facing interrupted-operation recovery only when an interruption exists', async () => {
    const desktop = installDesktopMock({ lifecycleResult: lifecycleWithInterrupted })
    renderWorkspace()

    expect(await screen.findByRole('heading', { name: '上一次数据操作未完成' })).toBeInTheDocument()
    expect(screen.getByText('数据尚未替换，可以安全返回原状')).toBeInTheDocument()
    expect(screen.getByText('安全信息不足，应用已保持只读保护')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '查看处理方式' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '查看处理方式' }))
    await waitFor(() =>
      expect(desktop.previewInterruptedRecovery).toHaveBeenCalledWith({
        operationId: interruptedOperationId,
      }),
    )
    expect(await screen.findByText('已准备安全处理方案')).toBeInTheDocument()
    expect(screen.getByText('应用将：恢复到上一次操作之前。')).toBeInTheDocument()

    const confirmation = screen.getByLabelText('我已查看处理方式，并确认让应用执行。')
    expect(screen.getByRole('button', { name: '确认执行安全处理' })).toBeDisabled()
    fireEvent.click(confirmation)
    fireEvent.click(screen.getByRole('button', { name: '确认执行安全处理' }))

    await waitFor(() =>
      expect(desktop.recoverInterruptedOperation).toHaveBeenCalledWith({
        confirmRecovery: true,
        operationId: interruptedOperationId,
        requestId: expect.any(String),
        retentionPolicy: 'forever',
      }),
    )
    expect(screen.getByRole('status')).toHaveTextContent('未完成的数据操作已按预览安全处理。')
  })

  it('keeps changed interrupted data protected without exposing confirmation', async () => {
    const desktop = installDesktopMock({
      interruptedPreviewResult: {
        canExecute: false,
        checkedAt,
        errors: ['state-changed'],
        operation: lifecycleWithInterrupted.interruptedOperations[0]!,
      },
      lifecycleResult: lifecycleWithInterrupted,
    })
    renderWorkspace()

    fireEvent.click(await screen.findByRole('button', { name: '查看处理方式' }))

    expect(await screen.findByText('当前状态不能安全处理')).toBeInTheDocument()
    expect(screen.getByText('数据状态已变化，请重新检查后再试。')).toBeInTheDocument()
    expect(screen.queryByLabelText('我已查看处理方式，并确认让应用执行。')).not.toBeInTheDocument()
    expect(desktop.recoverInterruptedOperation).not.toHaveBeenCalled()
  })
})
