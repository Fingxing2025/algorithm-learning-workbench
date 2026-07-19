import { app, BrowserWindow, dialog } from 'electron'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { createAppDatabase, type AppDatabase } from './database/database'
import { AiProviderRepository } from './database/ai-provider-repository'
import { ProblemRepository } from './database/problem-repository'
import { WorkspaceRepository } from './database/workspace-repository'
import { TemplateManagementRepository } from './database/template-management-repository'
import { registerAppIpc } from './ipc/register-app-ipc'
import { registerAiProviderIpc } from './ipc/register-ai-provider-ipc'
import { registerDataManagementIpc } from './ipc/register-data-management-ipc'
import { registerProblemIpc } from './ipc/register-problem-ipc'
import { registerProblemAnalysisIpc } from './ipc/register-problem-analysis-ipc'
import { registerWorkspaceIpc } from './ipc/register-workspace-ipc'
import { registerTemplateManagementIpc } from './ipc/register-template-management-ipc'
import { registerBackgroundTaskIpc } from './ipc/register-background-task-ipc'
import { installApplicationSecurityGuards } from './security/window-security'
import { ProblemService } from './services/problem-service'
import { ProblemAnalysisService } from './services/problem-analysis-service'
import { AiProviderService } from './services/ai-provider-service'
import { AiTaskRunRegistry } from './services/ai-task-run-registry'
import { SecretStore } from './security/secret-store'
import { WorkspaceService } from './services/workspace-service'
import { TemplateManagementService } from './services/template-management-service'
import { WorkspaceAiContextService } from './services/workspace-ai-context-service'
import { DataManagementService } from './services/data-management-service'
import { createMainWindow } from './window/create-main-window'
import { BackgroundTaskRegistry } from './services/background-task-registry'

let mainWindow: BrowserWindow | null = null
let appDatabase: AppDatabase | null = null
let aiTaskRunRegistry: AiTaskRunRegistry | null = null
let backgroundTaskRegistry: BackgroundTaskRegistry | null = null
let shutdownStarted = false
let shutdownComplete = false

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
  const templateManagementRepository = new TemplateManagementRepository(appDatabase)
  const workspaceRepository = new WorkspaceRepository(appDatabase)
  const problemRepository = new ProblemRepository(appDatabase)
  const workspaceService = new WorkspaceService(
    workspaceRepository,
    templateManagementRepository,
    app.getPath('userData'),
  )
  const aiProviderService = new AiProviderService(
    new AiProviderRepository(appDatabase),
    new SecretStore(app.getPath('userData')),
  )
  aiTaskRunRegistry = new AiTaskRunRegistry()
  backgroundTaskRegistry = new BackgroundTaskRegistry()
  const problemService = new ProblemService(problemRepository, app.getPath('userData'))
  const workspaceAiContextService = new WorkspaceAiContextService(
    workspaceRepository,
    templateManagementRepository,
    problemRepository,
  )
  const problemAnalysisService = new ProblemAnalysisService(
    aiProviderService,
    problemRepository,
    app.getPath('userData'),
    workspaceAiContextService,
    aiTaskRunRegistry,
  )
  const templateManagementService = new TemplateManagementService(
    aiProviderService,
    templateManagementRepository,
    workspaceRepository,
    workspaceService,
    app.getPath('userData'),
    workspaceAiContextService,
    aiTaskRunRegistry,
  )
  const dataManagementService = new DataManagementService(appDatabase, app.getPath('userData'))
  registerAppIpc()
  registerBackgroundTaskIpc(backgroundTaskRegistry)
  registerAiProviderIpc(aiProviderService)
  registerDataManagementIpc(dataManagementService, () => mainWindow ?? undefined)
  registerProblemIpc(problemService, () => mainWindow ?? undefined)
  registerProblemAnalysisIpc(problemAnalysisService, () => mainWindow ?? undefined)
  registerWorkspaceIpc(workspaceService, backgroundTaskRegistry, () => mainWindow ?? undefined)
  registerTemplateManagementIpc(
    templateManagementService,
    backgroundTaskRegistry,
    () => mainWindow ?? undefined,
  )
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

app.on('before-quit', event => {
  if (shutdownComplete) return
  event.preventDefault()
  if (shutdownStarted) return
  shutdownStarted = true
  aiTaskRunRegistry?.cancelAll()
  aiTaskRunRegistry = null
  const backgroundShutdown = backgroundTaskRegistry?.cancelAll() ?? Promise.resolve()
  void backgroundShutdown.finally(() => {
    backgroundTaskRegistry = null
    appDatabase?.close()
    appDatabase = null
    shutdownComplete = true
    app.quit()
  })
})

configureTestUserData()
void bootstrap().catch(() => {
  dialog.showErrorBox('无法启动应用', '本地数据初始化失败，请重新启动应用。')
  app.quit()
})
