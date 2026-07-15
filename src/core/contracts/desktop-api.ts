import type { RuntimeInfo } from './runtime'
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
  ClassifyTemplateRequest,
  ImportTemplateRequest,
  ImportTemplateResult,
  TemplateClassification,
  TemplateImportSource,
  TemplateMetadata,
  UpdateTemplateMetadataRequest,
  FileChangeExecution,
  FileChangeMutationResult,
  FileChangePlan,
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
  }
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
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
    cancelFilePlan: (planId: string) => Promise<FileChangePlan>
    chooseImportSource: () => Promise<TemplateImportSource | null>
    classify: (request: ClassifyTemplateRequest) => Promise<TemplateClassification>
    deleteTemplate: (templateId: string) => Promise<FileChangeMutationResult>
    getMetadata: (templateId: string) => Promise<TemplateMetadata | null>
    importTemplate: (request: ImportTemplateRequest) => Promise<ImportTemplateResult>
    generateFilePlan: () => Promise<FileChangePlan>
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
