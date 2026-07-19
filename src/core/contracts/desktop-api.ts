import type { RuntimeInfo } from './runtime'
import type {
  BackgroundTaskRequest,
  BackgroundTaskStatus,
  StartBackgroundTaskRequest,
} from './background-task'
import type { AiRequestPreview } from './ai-request'
import type {
  BackupExportResult,
  BackupLifecycleInventory,
  BackupLifecycleRequest,
  BackupVerification,
  CleanupPreview,
  CleanupPreviewRequest,
  DataDiagnostics,
  ExportBackupRequest,
  InterruptedRecoveryPreview,
  InterruptedRecoveryPreviewRequest,
  QuarantineCleanupRequest,
  QuarantineCleanupResult,
  QuarantineReleasePreview,
  QuarantineReleasePreviewRequest,
  RecoverInterruptedOperationRequest,
  RecoverInterruptedOperationResult,
  ReleaseQuarantineRequest,
  ReleaseQuarantineResult,
  RestoreBackupRequest,
  RestoreBackupResult,
  RestorePreview,
  UndoCleanupRequest,
  UndoCleanupResult,
} from './data-management'
import type {
  AiConnectionResult,
  AiProviderIdRequest,
  AiProviderProfile,
  AiTaskRoute,
  CreateAiProviderRequest,
  UpdateAiProviderRequest,
  UpsertAiTaskRouteRequest,
} from './ai-provider'
import type {
  AnalyzeProblemRequest,
  CommitProblemAnalysisRequest,
  ProblemAnalysisDraft,
  ProblemAnalysisImage,
  PreviewProblemAnalysisRequest,
} from './problem-analysis'
import type {
  ApplyTemplateRelocationRequest,
  ArchiveFilePlansRequest,
  ArchiveFilePlansResult,
  DeleteFileExecutionsRequest,
  DeleteFileExecutionsResult,
  BatchImportTemplateRequest,
  BatchImportTemplateResult,
  BatchTemplateImportSource,
  InspectBatchTemplateImportRequest,
  InspectBatchTemplateImportResult,
  ClassifyTemplateRequest,
  ImportTemplateRequest,
  ImportTemplateResult,
  PreviewBatchTemplateClassificationRequest,
  PreviewTemplateRelocationRequest,
  TemplateClassification,
  TemplateImportSource,
  TemplateMetadata,
  TemplateRelocationPreview,
  UpdateTemplateMetadataRequest,
  FileChangeExecution,
  FileChangeExecutionPage,
  FileHistoryPageRequest,
  FileChangeMutationResult,
  FileChangePlan,
  FileChangePlanPage,
  FilePlanGenerationRequest,
  WorkspaceAudit,
  PreviewTemplateClassificationRequest,
} from './template-management'
import type {
  CreateProblemRequest,
  Problem,
  ProblemImageData,
  ProblemPage,
  ProblemPageRequest,
  ProblemRequest,
  TemplateProblemPage,
  TemplateProblemPageRequest,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
  UpdateProblemRequest,
  UpsertProblemRelationRequest,
} from './problem'
import type {
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  CreateTemplateResult,
  TemplateActionRequest,
  TemplatePage,
  TemplatePageRequest,
  TemplateRequest,
  TemplateSummary,
  TemplateSource,
  WorkspaceSnapshot,
} from './workspace'

export interface DesktopApi {
  backgroundTasks: {
    cancel: (request: BackgroundTaskRequest) => Promise<BackgroundTaskStatus>
    get: (request: BackgroundTaskRequest) => Promise<BackgroundTaskStatus>
  }
  aiProviders: {
    create: (request: CreateAiProviderRequest) => Promise<AiProviderProfile>
    delete: (request: AiProviderIdRequest) => Promise<void>
    list: () => Promise<AiProviderProfile[]>
    listRoutes: () => Promise<AiTaskRoute[]>
    testConnection: (request: AiProviderIdRequest) => Promise<AiConnectionResult>
    update: (request: UpdateAiProviderRequest) => Promise<AiProviderProfile>
    upsertRoute: (request: UpsertAiTaskRouteRequest) => Promise<AiTaskRoute>
  }
  problemAnalysis: {
    analyze: (request: AnalyzeProblemRequest) => Promise<ProblemAnalysisDraft>
    cancel: (requestId: string) => Promise<void>
    chooseImages: () => Promise<ProblemAnalysisImage[]>
    commit: (request: CommitProblemAnalysisRequest) => Promise<Problem>
    preview: (request: PreviewProblemAnalysisRequest) => Promise<AiRequestPreview>
  }
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  dataManagement: {
    diagnose: () => Promise<DataDiagnostics>
    exportBackup: (request: ExportBackupRequest) => Promise<BackupExportResult | null>
    inspectBackupLifecycle: (request: BackupLifecycleRequest) => Promise<BackupLifecycleInventory>
    previewCleanup: (request: CleanupPreviewRequest) => Promise<CleanupPreview>
    previewInterruptedRecovery: (
      request: InterruptedRecoveryPreviewRequest,
    ) => Promise<InterruptedRecoveryPreview>
    previewQuarantineRelease: (
      request: QuarantineReleasePreviewRequest,
    ) => Promise<QuarantineReleasePreview>
    previewRestore: () => Promise<RestorePreview | null>
    quarantineCleanup: (request: QuarantineCleanupRequest) => Promise<QuarantineCleanupResult>
    recoverInterruptedOperation: (
      request: RecoverInterruptedOperationRequest,
    ) => Promise<RecoverInterruptedOperationResult>
    releaseQuarantine: (request: ReleaseQuarantineRequest) => Promise<ReleaseQuarantineResult>
    restoreBackup: (request: RestoreBackupRequest) => Promise<RestoreBackupResult>
    undoCleanup: (request: UndoCleanupRequest) => Promise<UndoCleanupResult>
    verifyBackup: () => Promise<BackupVerification | null>
  }
  problems: {
    addImages: (problemId: string) => Promise<Problem | null>
    create: (request: CreateProblemRequest) => Promise<Problem>
    delete: (request: ProblemRequest) => Promise<void>
    get: (request: ProblemRequest) => Promise<Problem>
    list: () => Promise<Problem[]>
    listByTemplate: (request: TemplateProblemPageRequest) => Promise<TemplateProblemPage>
    listPage: (request: ProblemPageRequest) => Promise<ProblemPage>
    readImage: (imageId: string) => Promise<ProblemImageData>
    removeImage: (request: RemoveProblemImageRequest) => Promise<Problem>
    removeRelation: (request: RemoveProblemRelationRequest) => Promise<Problem>
    update: (request: UpdateProblemRequest) => Promise<Problem>
    upsertRelation: (request: UpsertProblemRelationRequest) => Promise<Problem>
  }
  templates: {
    create: (request: CreateTemplateRequest) => Promise<CreateTemplateResult>
    getSummary: (request: TemplateRequest) => Promise<TemplateSummary>
    listPage: (request: TemplatePageRequest) => Promise<TemplatePage>
    performAction: (request: TemplateActionRequest) => Promise<void>
    readSource: (templateId: string) => Promise<TemplateSource>
  }
  templateManagement: {
    applyTemplateRelocation: (
      request: ApplyTemplateRelocationRequest,
    ) => Promise<FileChangeMutationResult>
    applyFilePlan: (request: {
      operationIds: string[]
      planId: string
    }) => Promise<FileChangeMutationResult>
    archiveFilePlans: (request: ArchiveFilePlansRequest) => Promise<ArchiveFilePlansResult>
    auditWorkspace: () => Promise<WorkspaceAudit>
    startAudit: (request: StartBackgroundTaskRequest) => Promise<BackgroundTaskStatus>
    cancelFilePlanGeneration: (requestId: string) => Promise<void>
    cancelClassification: (requestId: string) => Promise<void>
    cancelFilePlan: (planId: string) => Promise<FileChangePlan>
    chooseBatchImportDirectory: () => Promise<BatchTemplateImportSource[]>
    chooseBatchImportFiles: () => Promise<BatchTemplateImportSource[]>
    chooseImportSource: () => Promise<TemplateImportSource | null>
    classify: (request: ClassifyTemplateRequest) => Promise<TemplateClassification>
    deleteTemplate: (templateId: string) => Promise<FileChangeMutationResult>
    deleteFileExecutions: (
      request: DeleteFileExecutionsRequest,
    ) => Promise<DeleteFileExecutionsResult>
    exportFilePlanDiagnostic: (planId: string | null) => Promise<boolean>
    getMetadata: (templateId: string) => Promise<TemplateMetadata | null>
    importTemplate: (request: ImportTemplateRequest) => Promise<ImportTemplateResult>
    importTemplatesBatch: (
      request: BatchImportTemplateRequest,
    ) => Promise<BatchImportTemplateResult>
    inspectBatchImport: (
      request: InspectBatchTemplateImportRequest,
    ) => Promise<InspectBatchTemplateImportResult>
    previewBatchClassification: (
      request: PreviewBatchTemplateClassificationRequest,
    ) => Promise<AiRequestPreview>
    previewClassification: (
      request: PreviewTemplateClassificationRequest,
    ) => Promise<AiRequestPreview>
    previewFilePlan: (request: FilePlanGenerationRequest) => Promise<AiRequestPreview>
    previewTemplateRelocation: (
      request: PreviewTemplateRelocationRequest,
    ) => Promise<TemplateRelocationPreview>
    generateFilePlan: (request: FilePlanGenerationRequest) => Promise<FileChangePlan>
    listFileExecutions: () => Promise<FileChangeExecution[]>
    listFileExecutionsPage: (request: FileHistoryPageRequest) => Promise<FileChangeExecutionPage>
    listFilePlans: () => Promise<FileChangePlan[]>
    listFilePlansPage: (request: FileHistoryPageRequest) => Promise<FileChangePlanPage>
    redraftFilePlan: (planId: string) => Promise<FileChangePlan>
    rollbackFileExecution: (executionId: string) => Promise<FileChangeMutationResult>
    updateMetadata: (request: UpdateTemplateMetadataRequest) => Promise<TemplateMetadata>
  }
  workspace: {
    choose: (request: ChooseWorkspaceRequest) => Promise<WorkspaceSnapshot | null>
    getCurrent: () => Promise<WorkspaceSnapshot | null>
    rescan: () => Promise<WorkspaceSnapshot>
    startRescan: (request: StartBackgroundTaskRequest) => Promise<BackgroundTaskStatus>
  }
}
