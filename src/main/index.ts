import { app, BrowserWindow } from 'electron'

import { registerAppIpc } from './ipc/register-app-ipc'
import { installApplicationSecurityGuards } from './security/window-security'
import { createMainWindow } from './window/create-main-window'

let mainWindow: BrowserWindow | null = null

async function bootstrap(): Promise<void> {
  await app.whenReady()

  installApplicationSecurityGuards()
  registerAppIpc()
  mainWindow = createMainWindow()

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow()
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

void bootstrap()
