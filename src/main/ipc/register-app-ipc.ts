import { app, ipcMain } from 'electron'

import { runtimeInfoSchema, type RuntimeInfo } from '@core/contracts/runtime'
import { IPC_CHANNELS } from '@core/ipc/channels'

function getSupportedPlatform(): RuntimeInfo['platform'] {
  if (
    process.platform === 'darwin' ||
    process.platform === 'linux' ||
    process.platform === 'win32'
  ) {
    return process.platform
  }

  throw new Error(`Unsupported desktop platform: ${process.platform}`)
}

export function registerAppIpc(): void {
  ipcMain.removeHandler(IPC_CHANNELS.app.getRuntimeInfo)
  ipcMain.handle(IPC_CHANNELS.app.getRuntimeInfo, () =>
    runtimeInfoSchema.parse({
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      isPackaged: app.isPackaged,
      platform: getSupportedPlatform(),
    }),
  )
}
