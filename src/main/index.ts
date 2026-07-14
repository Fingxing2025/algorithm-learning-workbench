import { app, BrowserWindow, dialog } from 'electron'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { createAppDatabase, type AppDatabase } from './database/database'
import { AiProviderRepository } from './database/ai-provider-repository'
import { ProblemRepository } from './database/problem-repository'
import { WorkspaceRepository } from './database/workspace-repository'
import { registerAppIpc } from './ipc/register-app-ipc'
import { registerAiProviderIpc } from './ipc/register-ai-provider-ipc'
import { registerProblemIpc } from './ipc/register-problem-ipc'
import { registerWorkspaceIpc } from './ipc/register-workspace-ipc'
import { installApplicationSecurityGuards } from './security/window-security'
import { ProblemService } from './services/problem-service'
import { AiProviderService } from './services/ai-provider-service'
import { SecretStore } from './security/secret-store'
import { WorkspaceService } from './services/workspace-service'
import { createMainWindow } from './window/create-main-window'

let mainWindow: BrowserWindow | null = null
let appDatabase: AppDatabase | null = null

function configureTestUserData(): void {
  const testUserDataPath = process.env.E2E_USER_DATA_DIR
  if (process.env.NODE_ENV !== 'test' || !testUserDataPath) {
    return
  }

  const canonicalTempRoot = realpathSync(tmpdir())
  const canonicalTestPath = realpathSync(resolve(testUserDataPath))
  const pathFromTemp = relative(canonicalTempRoot, canonicalTestPath)
  if (isAbsolute(pathFromTemp) || pathFromTemp.startsWith('..')) {
    throw new Error('E2E user data directory must be inside the system temp directory')
  }
  app.setPath('userData', canonicalTestPath)
}

async function bootstrap(): Promise<void> {
  await app.whenReady()

  installApplicationSecurityGuards()
  appDatabase = createAppDatabase(app.getPath('userData'))
  const workspaceService = new WorkspaceService(new WorkspaceRepository(appDatabase))
  const aiProviderService = new AiProviderService(
    new AiProviderRepository(appDatabase),
    new SecretStore(app.getPath('userData')),
  )
  const problemService = new ProblemService(
    new ProblemRepository(appDatabase),
    app.getPath('userData'),
  )
  registerAppIpc()
  registerAiProviderIpc(aiProviderService)
  registerProblemIpc(problemService, () => mainWindow ?? undefined)
  registerWorkspaceIpc(workspaceService, () => mainWindow ?? undefined)
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

app.on('before-quit', () => {
  appDatabase?.close()
  appDatabase = null
})

configureTestUserData()
void bootstrap().catch(() => {
  dialog.showErrorBox('无法启动应用', '本地数据初始化失败，请重新启动应用。')
  app.quit()
})
