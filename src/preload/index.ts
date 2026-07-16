import { contextBridge, ipcRenderer } from 'electron'

import type { DesktopApi } from '@core/contracts/desktop-api'
import type { IpcResult } from '@core/contracts/ipc-result'
import type { RuntimeInfo } from '@core/contracts/runtime'
import { IPC_CHANNELS } from '@core/ipc/channels'

async function invokeResult<Value>(channel: string, input?: unknown): Promise<Value> {
  const result = (await ipcRenderer.invoke(channel, input)) as IpcResult<Value>
  if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
    throw new Error('主进程返回了无效响应。')
  }
  if (!result.ok) {
    throw Object.assign(new Error(result.error.message), {
      code: result.error.code,
      retryAfterMs: result.error.retryAfterMs,
    })
  }
  return result.value
}

const desktopApi: DesktopApi = {
  aiProviders: {
    create: request => invokeResult(IPC_CHANNELS.aiProviders.create, request),
    delete: async request => {
      await invokeResult<null>(IPC_CHANNELS.aiProviders.delete, request)
    },
    list: () => invokeResult(IPC_CHANNELS.aiProviders.list),
    listRoutes: () => invokeResult(IPC_CHANNELS.aiProviders.listRoutes),
    testConnection: request => invokeResult(IPC_CHANNELS.aiProviders.testConnection, request),
    update: request => invokeResult(IPC_CHANNELS.aiProviders.update, request),
    upsertRoute: request => invokeResult(IPC_CHANNELS.aiProviders.upsertRoute, request),
  },
  app: {
    getRuntimeInfo: () =>
      ipcRenderer.invoke(IPC_CHANNELS.app.getRuntimeInfo) as Promise<RuntimeInfo>,
  },
  problems: {
    addImages: problemId => invokeResult(IPC_CHANNELS.problems.addImages, { problemId }),
    create: request => invokeResult(IPC_CHANNELS.problems.create, request),
    delete: async request => {
      await invokeResult<null>(IPC_CHANNELS.problems.delete, request)
    },
    list: () => invokeResult(IPC_CHANNELS.problems.list),
    readImage: imageId => invokeResult(IPC_CHANNELS.problems.readImage, { imageId }),
    removeImage: request => invokeResult(IPC_CHANNELS.problems.removeImage, request),
    removeRelation: request => invokeResult(IPC_CHANNELS.problems.removeRelation, request),
    update: request => invokeResult(IPC_CHANNELS.problems.update, request),
    upsertRelation: request => invokeResult(IPC_CHANNELS.problems.upsertRelation, request),
  },
  problemAnalysis: {
    analyze: request => invokeResult(IPC_CHANNELS.problemAnalysis.analyze, request),
    chooseImages: () => invokeResult(IPC_CHANNELS.problemAnalysis.chooseImages),
    commit: request => invokeResult(IPC_CHANNELS.problemAnalysis.commit, request),
    preview: request => invokeResult(IPC_CHANNELS.problemAnalysis.preview, request),
  },
  templates: {
    create: request => invokeResult(IPC_CHANNELS.templates.create, request),
    performAction: async request => {
      await invokeResult<null>(IPC_CHANNELS.templates.performAction, request)
    },
    readSource: templateId => invokeResult(IPC_CHANNELS.templates.readSource, { templateId }),
  },
  templateManagement: {
    applyFilePlan: request => invokeResult(IPC_CHANNELS.templateManagement.applyFilePlan, request),
    auditWorkspace: () => invokeResult(IPC_CHANNELS.templateManagement.auditWorkspace),
    cancelFilePlanGeneration: async requestId => {
      await invokeResult<null>(IPC_CHANNELS.templateManagement.cancelFilePlanGeneration, {
        requestId,
      })
    },
    cancelFilePlan: planId =>
      invokeResult(IPC_CHANNELS.templateManagement.cancelFilePlan, { planId }),
    chooseBatchImportDirectory: () =>
      invokeResult(IPC_CHANNELS.templateManagement.chooseBatchImportDirectory),
    chooseBatchImportFiles: () =>
      invokeResult(IPC_CHANNELS.templateManagement.chooseBatchImportFiles),
    chooseImportSource: () => invokeResult(IPC_CHANNELS.templateManagement.chooseImportSource),
    classify: request => invokeResult(IPC_CHANNELS.templateManagement.classify, request),
    deleteTemplate: templateId =>
      invokeResult(IPC_CHANNELS.templateManagement.deleteTemplate, { templateId }),
    exportFilePlanDiagnostic: planId =>
      invokeResult(IPC_CHANNELS.templateManagement.exportFilePlanDiagnostic, { planId }),
    getMetadata: templateId =>
      invokeResult(IPC_CHANNELS.templateManagement.getMetadata, { templateId }),
    importTemplate: request =>
      invokeResult(IPC_CHANNELS.templateManagement.importTemplate, request),
    importTemplatesBatch: request =>
      invokeResult(IPC_CHANNELS.templateManagement.importTemplatesBatch, request),
    inspectBatchImport: request =>
      invokeResult(IPC_CHANNELS.templateManagement.inspectBatchImport, request),
    previewBatchClassification: request =>
      invokeResult(IPC_CHANNELS.templateManagement.previewBatchClassification, request),
    previewClassification: request =>
      invokeResult(IPC_CHANNELS.templateManagement.previewClassification, request),
    previewFilePlan: request =>
      invokeResult(IPC_CHANNELS.templateManagement.previewFilePlan, request),
    generateFilePlan: request =>
      invokeResult(IPC_CHANNELS.templateManagement.generateFilePlan, request),
    listFileExecutions: () => invokeResult(IPC_CHANNELS.templateManagement.listFileExecutions),
    listFilePlans: () => invokeResult(IPC_CHANNELS.templateManagement.listFilePlans),
    redraftFilePlan: planId =>
      invokeResult(IPC_CHANNELS.templateManagement.redraftFilePlan, { planId }),
    rollbackFileExecution: executionId =>
      invokeResult(IPC_CHANNELS.templateManagement.rollbackFileExecution, { executionId }),
    updateMetadata: request =>
      invokeResult(IPC_CHANNELS.templateManagement.updateMetadata, request),
  },
  workspace: {
    choose: request => invokeResult(IPC_CHANNELS.workspace.choose, request),
    getCurrent: () => invokeResult(IPC_CHANNELS.workspace.getCurrent),
    rescan: () => invokeResult(IPC_CHANNELS.workspace.rescan),
  },
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
