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
  BackupSelectionRequest,
  BackupVerification,
  DataDiagnostics,
  ExportBackupRequest,
  InterruptedRecoveryPreview,
  InterruptedRecoveryPreviewRequest,
  RecoverInterruptedOperationRequest,
  RecoverInterruptedOperationResult,
  RestoreBackupRequest,
  RestoreBackupResult,
  RestorePreview,
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
  ApplyExistingTemplateMetadataCompletionRequest,
  ApplyExistingTemplateMetadataCompletionResult,
  ApplyTemplateRelocationRequest,
  DeleteFilePlansRequest,
  DeleteFilePlansResult,
  DeleteFileExecutionsRequest,
  DeleteFileExecutionsResult,
  DeleteInvalidFileExecutionsRequest,
  DeleteInvalidFileExecutionsResult,
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
  FileHistoryDeletionPreview,
  InvalidFileExecutionDeletionPreview,
  InvalidFileExecutionPage,
  InvalidFileExecutionPageRequest,
  FileChangeMutationResult,
  FileChangePlan,
  FileChangePlanPage,
  FilePlanGenerationRequest,
  FilePlanRequestPreview,
  ExistingTemplateMetadataCompletionDraft,
  ExistingTemplateMetadataCompletionPreview,
  GenerateExistingTemplateMetadataCompletionRequest,
  PreviewFilePlanRequest,
  PreviewExistingTemplateMetadataCompletionRequest,
  WorkspaceAudit,
  PreviewTemplateClassificationRequest,
  PreviewDeleteFileExecutionsRequest,
  PreviewDeleteInvalidFileExecutionsRequest,
  PreviewDeleteFilePlansRequest,
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
  ApplyTemplateSourceEditRequest,
  ApplyTemplateSourceEditResult,
  ChooseWorkspaceRequest,
  CreateTemplateRequest,
  CreateTemplateResult,
  PreviewTemplateSourceEditRequest,
  TemplateActionRequest,
  TemplatePage,
  TemplatePageRequest,
  TemplateRequest,
  TemplateSummary,
  TemplateSource,
  TemplateSourceEditPreview,
  WorkspaceSnapshot,
} from './workspace'
import type {
  CancelTemplateExportRequest,
  TemplateExportRequest,
  TemplateExportResult,
} from './template-export'

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
    previewInterruptedRecovery: (
      request: InterruptedRecoveryPreviewRequest,
    ) => Promise<InterruptedRecoveryPreview>
    previewRestore: (request: BackupSelectionRequest) => Promise<RestorePreview | null>
    recoverInterruptedOperation: (
      request: RecoverInterruptedOperationRequest,
    ) => Promise<RecoverInterruptedOperationResult>
    restoreBackup: (request: RestoreBackupRequest) => Promise<RestoreBackupResult>
    verifyBackup: (request: BackupSelectionRequest) => Promise<BackupVerification | null>
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
    applySourceEdit: (
      request: ApplyTemplateSourceEditRequest,
    ) => Promise<ApplyTemplateSourceEditResult>
    create: (request: CreateTemplateRequest) => Promise<CreateTemplateResult>
    getSummary: (request: TemplateRequest) => Promise<TemplateSummary>
    listPage: (request: TemplatePageRequest) => Promise<TemplatePage>
    performAction: (request: TemplateActionRequest) => Promise<void>
    previewSourceEdit: (
      request: PreviewTemplateSourceEditRequest,
    ) => Promise<TemplateSourceEditPreview>
    readSource: (templateId: string) => Promise<TemplateSource>
    export: (request: TemplateExportRequest) => Promise<TemplateExportResult | null>
    cancelExport: (request: CancelTemplateExportRequest) => Promise<void>
  }
  templateManagement: {
    applyExistingMetadataCompletion: (
      request: ApplyExistingTemplateMetadataCompletionRequest,
    ) => Promise<ApplyExistingTemplateMetadataCompletionResult>
    applyTemplateRelocation: (
      request: ApplyTemplateRelocationRequest,
    ) => Promise<FileChangeMutationResult>
    applyFilePlan: (request: {
      operationIds: string[]
      planId: string
      requestId?: string
    }) => Promise<FileChangeMutationResult>
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
    deleteInvalidFileExecutions: (
      request: DeleteInvalidFileExecutionsRequest,
    ) => Promise<DeleteInvalidFileExecutionsResult>
    deleteFilePlans: (request: DeleteFilePlansRequest) => Promise<DeleteFilePlansResult>
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
    previewExistingMetadataCompletion: (
      request: PreviewExistingTemplateMetadataCompletionRequest,
    ) => Promise<ExistingTemplateMetadataCompletionPreview>
    previewFilePlan: (request: PreviewFilePlanRequest) => Promise<FilePlanRequestPreview>
    previewDeleteFileExecutions: (
      request: PreviewDeleteFileExecutionsRequest,
    ) => Promise<FileHistoryDeletionPreview>
    previewDeleteInvalidFileExecutions: (
      request: PreviewDeleteInvalidFileExecutionsRequest,
    ) => Promise<InvalidFileExecutionDeletionPreview>
    previewDeleteFilePlans: (
      request: PreviewDeleteFilePlansRequest,
    ) => Promise<FileHistoryDeletionPreview>
    previewTemplateRelocation: (
      request: PreviewTemplateRelocationRequest,
    ) => Promise<TemplateRelocationPreview>
    generateFilePlan: (request: FilePlanGenerationRequest) => Promise<FileChangePlan>
    generateExistingMetadataCompletion: (
      request: GenerateExistingTemplateMetadataCompletionRequest,
    ) => Promise<ExistingTemplateMetadataCompletionDraft>
    listFileExecutions: () => Promise<FileChangeExecution[]>
    listFileExecutionsPage: (request: FileHistoryPageRequest) => Promise<FileChangeExecutionPage>
    listInvalidFileExecutionsPage: (
      request: InvalidFileExecutionPageRequest,
    ) => Promise<InvalidFileExecutionPage>
    listFilePlans: () => Promise<FileChangePlan[]>
    listFilePlansPage: (request: FileHistoryPageRequest) => Promise<FileChangePlanPage>
    redraftFilePlan: (planId: string) => Promise<FileChangePlan>
    rollbackFileExecution: (
      executionId: string,
      requestId?: string,
    ) => Promise<FileChangeMutationResult>
    updateMetadata: (request: UpdateTemplateMetadataRequest) => Promise<TemplateMetadata>
  }
  workspace: {
    choose: (request: ChooseWorkspaceRequest) => Promise<WorkspaceSnapshot | null>
    getCurrent: () => Promise<WorkspaceSnapshot | null>
    rescan: () => Promise<WorkspaceSnapshot>
    startRescan: (request: StartBackgroundTaskRequest) => Promise<BackgroundTaskStatus>
  }
}
