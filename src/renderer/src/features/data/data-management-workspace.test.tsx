import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  BackupExportResult,
  BackupManifest,
  BackupVerification,
  DataDiagnostics,
  RestoreBackupResult,
  RestorePreview,
} from '@core/contracts/data-management'

import { I18nProvider } from '@/lib/i18n'

import { DataManagementWorkspace } from './data-management-workspace'

const checkedAt = '2026-07-21T00:00:00.000Z'
const counts = {
  aiProviderProfiles: 1,
  aiTaskRoutes: 0,
  batchImportBackupDirectories: 0,
  fileChangeExecutions: 0,
  fileChangePlans: 0,
  filePlanBackupDirectories: 0,
  problemImages: 0,
  problemImageFiles: 0,
  problems: 2,
  templateMetadata: 1,
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

const manifest: BackupManifest = {
  appVersion: '0.1.2',
  completed: true,
  counts,
  createdAt: checkedAt,
  diagnostics,
  files: [{ bytes: 512, path: 'database.sqlite', sha256: 'a'.repeat(64) }],
  formatVersion: 'v1',
  includeTemplateSources: true,
  packageId: '11111111-1111-4111-8111-111111111111',
  privacy: { excluded: ['provider-secrets'], providerSecrets: 'omitted' },
  sqlite: { foreignKeyOk: true, quickCheck: 'ok', sanitizedProviderSecrets: true },
}

const verification: BackupVerification = {
  checkedAt,
  errors: [],
  manifest,
  ok: true,
  packagePath: '/tmp/algorithm-workbench-backup.zip',
}

const exportResult: BackupExportResult = {
  manifest,
  packagePath: verification.packagePath!,
  verification,
}

const restorePreview: RestorePreview = {
  canRestore: true,
  conflicts: [],
  currentCounts: counts,
  manifest,
  verification,
}

const restoreResult: RestoreBackupResult = {
  preflightBackupPath: '/tmp/preflight-backup.zip',
  providerSecretsNeedReentry: true,
  restoredCounts: counts,
  skippedTemplateSources: true,
}

const lifecycle = {
  areas: [],
  candidates: [],
  checkedAt,
  interruptedOperationCount: 0,
  interruptedOperations: [],
  quarantineOperations: [],
  quarantinableBytes: 0,
  retentionPolicy: 'forever' as const,
  schemaVersion: 1 as const,
  totalManagedBytes: 0,
}

function installDesktopMock() {
  const diagnose = vi.fn().mockResolvedValue(diagnostics)
  const inspectBackupLifecycle = vi.fn().mockResolvedValue(lifecycle)
  const exportBackup = vi.fn().mockResolvedValue(exportResult)
  const verifyBackup = vi.fn().mockResolvedValue(verification)
  const previewRestore = vi.fn().mockResolvedValue(restorePreview)
  const restoreBackup = vi.fn().mockResolvedValue(restoreResult)

  Object.defineProperty(window, 'desktop', {
    configurable: true,
    value: {
      dataManagement: {
        diagnose,
        exportBackup,
        inspectBackupLifecycle,
        previewRestore,
        restoreBackup,
        verifyBackup,
      },
    },
  })

  return { diagnose, exportBackup, previewRestore, restoreBackup, verifyBackup }
}

function renderWorkspace() {
  render(
    <I18nProvider>
      <DataManagementWorkspace />
    </I18nProvider>,
  )
}

describe('DataManagementWorkspace backup and restore behavior', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('exports the selected source scope and surfaces the verified manifest', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    await waitFor(() => expect(screen.getByRole('button', { name: '导出备份' })).toBeEnabled())
    fireEvent.click(screen.getByLabelText('包含模板源码副本'))
    fireEvent.click(screen.getByRole('button', { name: '导出备份' }))

    await waitFor(() =>
      expect(desktop.exportBackup).toHaveBeenCalledWith({ includeTemplateSources: true }),
    )
    expect(await screen.findByText('导出完成')).toBeInTheDocument()
    expect(screen.getByText('文件数量: 1 · 格式版本: v1')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('备份已导出并通过校验。')
  })

  it('verifies a backup package through the named desktop operation', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    await waitFor(() => expect(screen.getByRole('button', { name: '验证备份包' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '验证备份包' }))

    await waitFor(() => expect(desktop.verifyBackup).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('备份包校验通过')).toBeInTheDocument()
    expect(screen.getByText('版本: v1 · 题目: 2 · 模板: 3')).toBeInTheDocument()
  })

  it('focuses restore confirmation and restores only after explicit confirmation', async () => {
    const desktop = installDesktopMock()
    renderWorkspace()

    await waitFor(() => expect(screen.getByRole('button', { name: '恢复预览' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '恢复预览' }))

    const confirmation = await screen.findByLabelText(
      '我已确认恢复预览，并允许应用恢复 userData 中的数据副本。',
    )
    await waitFor(() => expect(confirmation).toHaveFocus())
    expect(screen.getByRole('button', { name: '确认恢复' })).toBeDisabled()

    fireEvent.click(confirmation)
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }))

    await waitFor(() =>
      expect(desktop.restoreBackup).toHaveBeenCalledWith({
        confirmRestore: true,
        packagePath: '/tmp/algorithm-workbench-backup.zip',
        templateSourceStrategy: 'skip',
      }),
    )
    expect(await screen.findByText('恢复完成')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      '恢复完成。Provider 密钥未恢复，请重新配置密钥。',
    )
    expect(desktop.diagnose).toHaveBeenCalledTimes(2)
  })
})
