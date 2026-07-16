import { z } from 'zod'

export const backupFormatVersionSchema = z.literal('v1')

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

export const backupManifestSchema = z
  .object({
    appVersion: z.string().min(1).max(80),
    completed: z.boolean(),
    counts: dataManagementCountsSchema,
    createdAt: z.string().datetime(),
    diagnostics: dataDiagnosticsSchema,
    files: z.array(backupFileEntrySchema).min(1).max(20_000),
    formatVersion: backupFormatVersionSchema,
    includeTemplateSources: z.boolean(),
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
export type BackupManifest = z.infer<typeof backupManifestSchema>

export const exportBackupRequestSchema = z
  .object({
    includeTemplateSources: z.boolean(),
  })
  .strict()
export type ExportBackupRequest = z.infer<typeof exportBackupRequestSchema>

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
    currentCounts: dataManagementCountsSchema,
    manifest: backupManifestSchema.nullable(),
    verification: backupVerificationSchema,
  })
  .strict()
export type RestorePreview = z.infer<typeof restorePreviewSchema>

export const restoreBackupRequestSchema = z
  .object({
    confirmRestore: z.literal(true),
    packagePath: z.string().min(1).max(4096),
    templateSourceStrategy: z.literal('skip'),
  })
  .strict()
export type RestoreBackupRequest = z.infer<typeof restoreBackupRequestSchema>

export const restoreBackupResultSchema = z
  .object({
    preflightBackupPath: z.string().min(1).max(4096),
    providerSecretsNeedReentry: z.boolean(),
    restoredCounts: dataManagementCountsSchema,
    skippedTemplateSources: z.boolean(),
  })
  .strict()
export type RestoreBackupResult = z.infer<typeof restoreBackupResultSchema>
