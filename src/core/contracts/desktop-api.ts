import type { RuntimeInfo } from './runtime'
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
