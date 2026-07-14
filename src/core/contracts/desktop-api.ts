import type { RuntimeInfo } from './runtime'
import type {
  CreateProblemRequest,
  Problem,
  ProblemImageData,
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
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  problems: {
    addImages: (problemId: string) => Promise<Problem | null>
    create: (request: CreateProblemRequest) => Promise<Problem>
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
  workspace: {
    choose: (request: ChooseWorkspaceRequest) => Promise<WorkspaceSnapshot | null>
    getCurrent: () => Promise<WorkspaceSnapshot | null>
    rescan: () => Promise<WorkspaceSnapshot>
  }
}
