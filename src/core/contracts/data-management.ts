import { z } from 'zod'

const progressRequestIdSchema = z.string().uuid().optional()

export const backupFormatVersionSchema = z.literal('v2')

export const dataManagementCountsSchema = z
  .object({
    aiProviderProfiles: z.number().int().nonnegative(),
    aiTaskRoutes: z.number().int().nonnegative(),
    batchImportBackupDirectories: z.number().int().nonnegative(),
    fileChangeExecutions: z.number().int().nonnegative(),
    fileChangePlans: z.number().int().nonnegative(),
    filePlanBackupDirectories: z.number().int().nonnegative(),
    problemImages: z.number().int().nonnegative(),
    problemImageFiles: z.number().int().nonnegative(),
    problems: z.number().int().nonnegative(),
    templateMetadata: z.number().int().nonnegative(),
    templateProblemRelations: z.number().int().nonnegative(),
    templates: z.number().int().nonnegative(),
    workspaces: z.number().int().nonnegative(),
  })
  .strict()
export type DataManagementCounts = z.infer<typeof dataManagementCountsSchema>

export const dataIntegrityIssueSchema = z
  .object({
    count: z.number().int().positive(),
    kind: z.enum([
      'batch-backup-without-record',
      'database-foreign-key',
      'database-quick-check',
      'file-plan-backup-without-record',
      'file-execution-backup-missing',
      'image-file-missing',
      'image-record-orphaned',
      'orphan-image-file',
      'residual-trash',
      'temporary-file',
    ]),
    severity: z.enum(['info', 'warning', 'error']),
  })
  .strict()
export type DataIntegrityIssue = z.infer<typeof dataIntegrityIssueSchema>

export const dataStorageAreaSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    key: z.enum([
      'batch-import-backups',
      'database',
      'data-management-quarantine',
      'electron-cache',
      'file-plan-backups',
      'problem-images',
      'restore-preflight-backups',
      'secrets-excluded',
      'temporary-backups',
      'user-data-total',
    ]),
  })
  .strict()
export type DataStorageArea = z.infer<typeof dataStorageAreaSchema>

export const dataDiagnosticsSchema = z
  .object({
    checkedAt: z.string().datetime(),
    counts: dataManagementCountsSchema,
    database: z
      .object({
        foreignKeyOk: z.boolean(),
        quickCheck: z.string().min(1).max(200),
        walPresent: z.boolean(),
      })
      .strict(),
    issues: z.array(dataIntegrityIssueSchema).max(100),
    storage: z.array(dataStorageAreaSchema).max(20),
  })
  .strict()
export type DataDiagnostics = z.infer<typeof dataDiagnosticsSchema>

export const backupFileEntrySchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    path: z.string().min(1).max(4096),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type BackupFileEntry = z.infer<typeof backupFileEntrySchema>

const backupManifestCommonSchema = z
  .object({
    appVersion: z.string().min(1).max(80),
    completed: z.boolean(),
    counts: dataManagementCountsSchema,
    createdAt: z.string().datetime(),
    diagnostics: dataDiagnosticsSchema,
    files: z.array(backupFileEntrySchema).min(1).max(20_000),
    includeTemplateSources: z.literal(true),
    packageId: z.string().uuid(),
    privacy: z
      .object({
        excluded: z.array(z.string().min(1).max(80)).max(20),
        providerSecrets: z.literal('omitted'),
      })
      .strict(),
    sqlite: z
      .object({
        foreignKeyOk: z.boolean(),
        quickCheck: z.string().min(1).max(200),
        sanitizedProviderSecrets: z.boolean(),
      })
      .strict(),
  })
  .strict()

export const portableBackupWorkspaceSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(255),
    templateFileCount: z.number().int().nonnegative(),
  })
  .strict()
export type PortableBackupWorkspace = z.infer<typeof portableBackupWorkspaceSchema>

export const backupManifestV2Schema = backupManifestCommonSchema
  .extend({
    archive: z
      .object({
        container: z.literal('zip'),
        entryNameEncoding: z.literal('utf-8'),
        pathNormalization: z.literal('NFC'),
        separator: z.literal('/'),
      })
      .strict(),
    createdOn: z.enum(['darwin', 'linux', 'win32']),
    formatVersion: z.literal('v2'),
    portability: z
      .object({
        caseInsensitivePathSafe: z.literal(true),
        sourceBytesPreserved: z.literal(true),
        windowsPathSafe: z.literal(true),
      })
      .strict(),
    workspaces: z.array(portableBackupWorkspaceSchema).length(1),
  })
  .strict()
export type BackupManifestV2 = z.infer<typeof backupManifestV2Schema>

export const backupManifestSchema = backupManifestV2Schema
export type BackupManifest = z.infer<typeof backupManifestSchema>

export const exportBackupRequestSchema = z
  .object({
    includeTemplateSources: z.literal(true),
    requestId: progressRequestIdSchema,
  })
  .strict()
export type ExportBackupRequest = z.infer<typeof exportBackupRequestSchema>

export const backupSelectionRequestSchema = z
  .object({
    requestId: progressRequestIdSchema,
  })
  .strict()
export type BackupSelectionRequest = z.infer<typeof backupSelectionRequestSchema>

export const backupVerificationSchema = z
  .object({
    checkedAt: z.string().datetime(),
    errors: z.array(z.string().min(1).max(200)).max(100),
    manifest: backupManifestSchema.nullable(),
    ok: z.boolean(),
    packagePath: z.string().max(4096).nullable(),
  })
  .strict()
export type BackupVerification = z.infer<typeof backupVerificationSchema>

export const backupExportResultSchema = z
  .object({
    manifest: backupManifestSchema,
    packagePath: z.string().min(1).max(4096),
    verification: backupVerificationSchema,
  })
  .strict()
export type BackupExportResult = z.infer<typeof backupExportResultSchema>

export const restorePreviewSchema = z
  .object({
    canRestore: z.boolean(),
    conflicts: z.array(z.string().min(1).max(200)).max(100),
    manifest: backupManifestSchema.nullable(),
    sourceWorkspace: portableBackupWorkspaceSchema.nullable(),
    targetCounts: dataManagementCountsSchema,
    targetWorkspace: portableBackupWorkspaceSchema,
    verification: backupVerificationSchema,
  })
  .strict()
export type RestorePreview = z.infer<typeof restorePreviewSchema>

export const restoreBackupRequestSchema = z
  .object({
    confirmRestore: z.literal(true),
    expectedSourceWorkspaceId: z.string().uuid(),
    expectedTargetWorkspaceId: z.string().uuid(),
    packagePath: z.string().min(1).max(4096),
    requestId: progressRequestIdSchema,
  })
  .strict()
export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>

export const restoreBackupResultSchema = z
  .object({
    preflightBackupPath: z.string().min(1).max(4096),
    providerSecretsNeedReentry: z.boolean(),
    restoredCounts: dataManagementCountsSchema,
    restoredTemplateSourceFiles: z.number().int().nonnegative(),
  })
  .strict()
export type RestoreBackupResult = z.infer<typeof restoreBackupResultSchema>

export const backupRetentionPolicySchema = z.enum(['forever', '7-days', '30-days', '90-days'])
export type BackupRetentionPolicy = z.infer<typeof backupRetentionPolicySchema>

export const backupLifecycleRequestSchema = z
  .object({ retentionPolicy: backupRetentionPolicySchema })
  .strict()
export type BackupLifecycleRequest = z.infer<typeof backupLifecycleRequestSchema>

export const cleanupCandidateCategorySchema = z.enum([
  'batch-import-backup',
  'file-plan-backup',
  'problem-image-trash',
  'restore-preflight-backup',
])
export type CleanupCandidateCategory = z.infer<typeof cleanupCandidateCategorySchema>

export const cleanupCandidateReasonSchema = z.enum([
  'applied-file-execution',
  'batch-import-without-record',
  'invalid-preflight-backup',
  'latest-valid-preflight',
  'residual-image-trash',
  'retention-expired',
  'retention-policy-forever',
  'rolled-back-file-execution',
  'symlink-detected',
  'unrecorded-file-plan-backup',
  'within-retention-window',
])
export type CleanupCandidateReason = z.infer<typeof cleanupCandidateReasonSchema>

export const cleanupCandidateSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    canQuarantine: z.boolean(),
    category: cleanupCandidateCategorySchema,
    createdAt: z.string().datetime(),
    disposition: z.enum(['protected', 'review', 'suggested']),
    id: z.string().regex(/^[a-f0-9]{64}$/),
    reason: cleanupCandidateReasonSchema,
    verificationOk: z.boolean().nullable(),
  })
  .strict()
export type CleanupCandidate = z.infer<typeof cleanupCandidateSchema>

export const backupLifecycleAreaSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    itemCount: z.number().int().nonnegative(),
    key: z.enum([
      'batch-import-backups',
      'data-management-quarantine',
      'file-plan-backups',
      'interrupted-operations',
      'problem-image-trash',
      'restore-preflight-backups',
    ]),
    quarantinableBytes: z.number().int().nonnegative(),
    quarantinableCount: z.number().int().nonnegative(),
  })
  .strict()
export type BackupLifecycleArea = z.infer<typeof backupLifecycleAreaSchema>

export const cleanupQuarantineOperationSchema = z
  .object({
    bytes: z.number().int().nonnegative(),
    canUndo: z.boolean(),
    createdAt: z.string().datetime(),
    id: z.string().uuid(),
    itemCount: z.number().int().positive(),
  })
  .strict()
export type CleanupQuarantineOperation = z.infer<typeof cleanupQuarantineOperationSchema>

export const backupLifecycleInventorySchema = z
  .object({
    areas: z.array(backupLifecycleAreaSchema).max(10),
    candidates: z.array(cleanupCandidateSchema).max(2_000),
    checkedAt: z.string().datetime(),
    interruptedOperationCount: z.number().int().nonnegative(),
    interruptedOperations: z
      .array(
        z
          .object({
            action: z.enum([
              'clear-restore-marker',
              'clear-history-deletion-marker',
              'complete-history-deletion',
              'complete-restore',
              'none',
              'restore-preflight',
              'rollback-cleanup',
            ]),
            bytes: z.number().int().nonnegative(),
            canRecover: z.boolean(),
            createdAt: z.string().datetime(),
            id: z.string().regex(/^[a-f0-9]{64}$/),
            kind: z.enum(['cleanup-operation', 'restore-marker', 'restore-operation', 'unknown']),
            reason: z.enum([
              'cleanup-journal-ready',
              'committed-history-deletion-ready',
              'committed-restore-ready',
              'journal-invalid',
              'preflight-invalid',
              'restore-marker-only',
              'restore-preflight-ready',
              'state-conflict',
              'unknown-temporary-item',
            ]),
          })
          .strict(),
      )
      .max(100),
    quarantineOperations: z.array(cleanupQuarantineOperationSchema).max(100),
    quarantinableBytes: z.number().int().nonnegative(),
    retentionPolicy: backupRetentionPolicySchema,
    schemaVersion: z.literal(1),
    totalManagedBytes: z.number().int().nonnegative(),
  })
  .strict()
export type BackupLifecycleInventory = z.infer<typeof backupLifecycleInventorySchema>
export type InterruptedDataOperation = BackupLifecycleInventory['interruptedOperations'][number]

export const cleanupPreviewRequestSchema = z
  .object({
    candidateIds: z
      .array(z.string().regex(/^[a-f0-9]{64}$/))
      .min(1)
      .max(100),
    retentionPolicy: backupRetentionPolicySchema,
  })
  .strict()
export type CleanupPreviewRequest = z.infer<typeof cleanupPreviewRequestSchema>

export const cleanupPreviewSchema = z
  .object({
    canExecute: z.boolean(),
    candidates: z.array(cleanupCandidateSchema).max(100),
    checkedAt: z.string().datetime(),
    errors: z
      .array(z.enum(['candidate-changed', 'candidate-not-found', 'candidate-protected']))
      .max(100),
    totalBytes: z.number().int().nonnegative(),
  })
  .strict()
export type CleanupPreview = z.infer<typeof cleanupPreviewSchema>

export const quarantineCleanupRequestSchema = cleanupPreviewRequestSchema
  .extend({ confirmQuarantine: z.literal(true), requestId: progressRequestIdSchema })
  .strict()
export type QuarantineCleanupRequest = z.infer<typeof quarantineCleanupRequestSchema>

export const quarantineCleanupResultSchema = z
  .object({
    inventory: backupLifecycleInventorySchema,
    operation: cleanupQuarantineOperationSchema,
    quarantinedCount: z.number().int().positive(),
  })
  .strict()
export type QuarantineCleanupResult = z.infer<typeof quarantineCleanupResultSchema>

export const undoCleanupRequestSchema = z
  .object({
    confirmUndo: z.literal(true),
    operationId: z.string().uuid(),
    requestId: progressRequestIdSchema,
    retentionPolicy: backupRetentionPolicySchema,
  })
  .strict()
export type UndoCleanupRequest = z.infer<typeof undoCleanupRequestSchema>

export const undoCleanupResultSchema = z
  .object({
    inventory: backupLifecycleInventorySchema,
    operationId: z.string().uuid(),
    restoredBytes: z.number().int().nonnegative(),
    restoredCount: z.number().int().positive(),
  })
  .strict()
export type UndoCleanupResult = z.infer<typeof undoCleanupResultSchema>

export const cleanupQuarantineManifestSchema = z
  .object({
    completed: z.literal(true),
    createdAt: z.string().datetime(),
    formatVersion: z.literal('v2'),
    items: z
      .array(
        z
          .object({
            bytes: z.number().int().nonnegative(),
            candidateId: z.string().regex(/^[a-f0-9]{64}$/),
            category: cleanupCandidateCategorySchema,
            fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
            originalRelativePath: z.string().min(1).max(4096),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    operationId: z.string().uuid(),
  })
  .strict()
export type CleanupQuarantineManifest = z.infer<typeof cleanupQuarantineManifestSchema>

const controlledBackupNameSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^/\\]+\.awb-backup$/)

const restoreDirectorySwapSchema = z
  .object({
    directoryName: z.enum(['batch-import-backups', 'file-plan-backups', 'problem-images']),
    hadOriginal: z.boolean(),
    hadRestoredCopy: z.boolean(),
    originalFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    restoredFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
  })
  .strict()

const restoreTemplateFileSchema = z
  .object({
    relativePath: z
      .string()
      .min(1)
      .max(4096)
      .refine(
        value =>
          !value.startsWith('/') &&
          !value.includes('\\') &&
          !value.includes('\0') &&
          value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
        'invalid template restore path',
      ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()

const restoreOperationJournalBase = {
  createdAt: z.string().datetime(),
  restoreId: z.string().uuid(),
  rollbackBackupName: controlledBackupNameSchema,
  swaps: z.array(restoreDirectorySwapSchema).max(3),
}

export const restoreOperationJournalSchema = z
  .object({
    ...restoreOperationJournalBase,
    formatVersion: z.literal('v2'),
    templateSwap: z
      .object({
        originalFiles: z.array(restoreTemplateFileSchema).max(100_000),
        restoredFiles: z.array(restoreTemplateFileSchema).max(100_000),
      })
      .strict()
      .nullable(),
  })
  .strict()
export type RestoreOperationJournal = z.infer<typeof restoreOperationJournalSchema>

export const cleanupOperationJournalSchema = z
  .object({
    createdAt: z.string().datetime(),
    formatVersion: z.literal('v2'),
    items: cleanupQuarantineManifestSchema.shape.items,
    operationId: z.string().uuid(),
  })
  .strict()
export type CleanupOperationJournal = z.infer<typeof cleanupOperationJournalSchema>

export const restoreCommitMarkerSchema = z
  .object({
    committedAt: z.string().datetime(),
    formatVersion: z.literal('v2'),
    restoreId: z.string().uuid(),
    rollbackBackupName: controlledBackupNameSchema,
  })
  .strict()
export type RestoreCommitMarker = z.infer<typeof restoreCommitMarkerSchema>

export const historyDeletionCommitMarkerSchema = z
  .object({
    committedAt: z.string().datetime(),
    formatVersion: z.literal('v2'),
    operationId: z.string().uuid(),
  })
  .strict()
export type HistoryDeletionCommitMarker = z.infer<typeof historyDeletionCommitMarkerSchema>

export const interruptedRecoveryPreviewRequestSchema = z
  .object({ operationId: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict()
export type InterruptedRecoveryPreviewRequest = z.infer<
  typeof interruptedRecoveryPreviewRequestSchema
>

export const interruptedRecoveryPreviewSchema = z
  .object({
    canExecute: z.boolean(),
    checkedAt: z.string().datetime(),
    errors: z
      .array(
        z.enum(['backup-invalid', 'operation-not-found', 'operation-protected', 'state-changed']),
      )
      .max(20),
    operation: backupLifecycleInventorySchema.shape.interruptedOperations.element.nullable(),
  })
  .strict()
export type InterruptedRecoveryPreview = z.infer<typeof interruptedRecoveryPreviewSchema>

export const recoverInterruptedOperationRequestSchema = interruptedRecoveryPreviewRequestSchema
  .extend({
    confirmRecovery: z.literal(true),
    requestId: progressRequestIdSchema,
    retentionPolicy: backupRetentionPolicySchema,
  })
  .strict()
export type RecoverInterruptedOperationRequest = z.infer<
  typeof recoverInterruptedOperationRequestSchema
>

export const recoverInterruptedOperationResultSchema = z
  .object({
    action: backupLifecycleInventorySchema.shape.interruptedOperations.element.shape.action,
    inventory: backupLifecycleInventorySchema,
    operationId: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type RecoverInterruptedOperationResult = z.infer<
  typeof recoverInterruptedOperationResultSchema
>

export const quarantineReleasePreviewRequestSchema = z
  .object({ operationId: z.string().uuid() })
  .strict()
export type QuarantineReleasePreviewRequest = z.infer<typeof quarantineReleasePreviewRequestSchema>

export const quarantineReleasePreviewSchema = z
  .object({
    canRelease: z.boolean(),
    checkedAt: z.string().datetime(),
    errors: z
      .array(z.enum(['operation-changed', 'operation-not-found', 'operation-not-releasable']))
      .max(20),
    operation: cleanupQuarantineOperationSchema.nullable(),
  })
  .strict()
export type QuarantineReleasePreview = z.infer<typeof quarantineReleasePreviewSchema>

export const releaseQuarantineRequestSchema = quarantineReleasePreviewRequestSchema
  .extend({
    confirmMoveToTrash: z.literal(true),
    requestId: progressRequestIdSchema,
    retentionPolicy: backupRetentionPolicySchema,
  })
  .strict()
export type ReleaseQuarantineRequest = z.infer<typeof releaseQuarantineRequestSchema>

export const releaseQuarantineResultSchema = z
  .object({
    inventory: backupLifecycleInventorySchema,
    operationId: z.string().uuid(),
    releasedBytes: z.number().int().nonnegative(),
    releasedItemCount: z.number().int().positive(),
  })
  .strict()
export type ReleaseQuarantineResult = z.infer<typeof releaseQuarantineResultSchema>
