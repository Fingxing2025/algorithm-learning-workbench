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
  app: {
    getRuntimeInfo: () =>
      ipcRenderer.invoke(IPC_CHANNELS.app.getRuntimeInfo) as Promise<RuntimeInfo>,
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
