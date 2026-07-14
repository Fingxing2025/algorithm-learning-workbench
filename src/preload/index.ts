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
    throw new Error(result.error.message)
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
  },
  templates: {
    create: request => invokeResult(IPC_CHANNELS.templates.create, request),
    performAction: async request => {
      await invokeResult<null>(IPC_CHANNELS.templates.performAction, request)
    },
    readSource: templateId => invokeResult(IPC_CHANNELS.templates.readSource, { templateId }),
  },
  workspace: {
    choose: request => invokeResult(IPC_CHANNELS.workspace.choose, request),
    getCurrent: () => invokeResult(IPC_CHANNELS.workspace.getCurrent),
    rescan: () => invokeResult(IPC_CHANNELS.workspace.rescan),
  },
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
