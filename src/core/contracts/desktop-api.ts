import type { RuntimeInfo } from './runtime'
import type { AiRequestPreview } from './ai-request'
import type {
  BackupExportResult,
  BackupVerification,
  DataDiagnostics,
  ExportBackupRequest,
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
} from './problem-analysis'
import type {
  BatchImportTemplateRequest,
  BatchImportTemplateResult,
  BatchTemplateImportSource,
  InspectBatchTemplateImportRequest,
  InspectBatchTemplateImportResult,
  ClassifyTemplateRequest,
  ImportTemplateRequest,
  ImportTemplateResult,
  PreviewBatchTemplateClassificationRequest,
  TemplateClassification,
  TemplateImportSource,
  TemplateMetadata,
  UpdateTemplateMetadataRequest,
  FileChangeExecution,
  FileChangeMutationResult,
  FileChangePlan,
  FilePlanGenerationRequest,
  WorkspaceAudit,
} from './template-management'
import type {
  CreateProblemRequest,
  Problem,
  ProblemImageData,
  ProblemRequest,
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
  TemplateSource,
  WorkspaceSnapshot,
} from './workspace'

export interface DesktopApi {
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
    chooseImages: () => Promise<ProblemAnalysisImage[]>
    commit: (request: CommitProblemAnalysisRequest) => Promise<Problem>
    preview: (request: AnalyzeProblemRequest) => Promise<AiRequestPreview>
  }
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  dataManagement: {
    diagnose: () => Promise<DataDiagnostics>
    exportBackup: (request: ExportBackupRequest) => Promise<BackupExportResult | null>
    previewRestore: () => Promise<RestorePreview | null>
    verifyBackup: () => Promise<BackupVerification | null>
  }
  problems: {
    addImages: (problemId: string) => Promise<Problem | null>
    create: (request: CreateProblemRequest) => Promise<Problem>
    delete: (request: ProblemRequest) => Promise<void>
    list: () => Promise<Problem[]>
    readImage: (imageId: string) => Promise<ProblemImageData>
    removeImage: (request: RemoveProblemImageRequest) => Promise<Problem>
    removeRelation: (request: RemoveProblemRelationRequest) => Promise<Problem>
    update: (request: UpdateProblemRequest) => Promise<Problem>
    upsertRelation: (request: UpsertProblemRelationRequest) => Promise<Problem>
  }
  templates: {
    create: (request: CreateTemplateRequest) => Promise<CreateTemplateResult>
    performAction: (request: TemplateActionRequest) => Promise<void>
    readSource: (templateId: string) => Promise<TemplateSource>
  }
  templateManagement: {
    applyFilePlan: (request: {
      operationIds: string[]
      planId: string
    }) => Promise<FileChangeMutationResult>
    auditWorkspace: () => Promise<WorkspaceAudit>
    cancelFilePlanGeneration: (requestId: string) => Promise<void>
    cancelFilePlan: (planId: string) => Promise<FileChangePlan>
    chooseBatchImportDirectory: () => Promise<BatchTemplateImportSource[]>
    chooseBatchImportFiles: () => Promise<BatchTemplateImportSource[]>
    chooseImportSource: () => Promise<TemplateImportSource | null>
    classify: (request: ClassifyTemplateRequest) => Promise<TemplateClassification>
    deleteTemplate: (templateId: string) => Promise<FileChangeMutationResult>
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
    previewClassification: (request: ClassifyTemplateRequest) => Promise<AiRequestPreview>
    previewFilePlan: (request: FilePlanGenerationRequest) => Promise<AiRequestPreview>
    generateFilePlan: (request: FilePlanGenerationRequest) => Promise<FileChangePlan>
    listFileExecutions: () => Promise<FileChangeExecution[]>
    listFilePlans: () => Promise<FileChangePlan[]>
    redraftFilePlan: (planId: string) => Promise<FileChangePlan>
    rollbackFileExecution: (executionId: string) => Promise<FileChangeMutationResult>
    updateMetadata: (request: UpdateTemplateMetadataRequest) => Promise<TemplateMetadata>
  }
  workspace: {
    choose: (request: ChooseWorkspaceRequest) => Promise<WorkspaceSnapshot | null>
    getCurrent: () => Promise<WorkspaceSnapshot | null>
    rescan: () => Promise<WorkspaceSnapshot>
  }
}
