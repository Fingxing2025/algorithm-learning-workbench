import { app, BrowserWindow, dialog } from 'electron'
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { createAppDatabase, type AppDatabase, WorkspaceDatabaseManager } from './database/database'
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
import { WorkspaceStorageManager } from './services/workspace-storage'
import { WorkspaceRuntimeManager } from './services/workspace-runtime-manager'
import { TemplateExportService } from './services/template-export-service'
import { registerTemplateExportIpc } from './ipc/register-template-export-ipc'

let mainWindow: BrowserWindow | null = null
let appDatabase: AppDatabase | null = null
let workspaceDatabaseManager: WorkspaceDatabaseManager | null = null
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
  workspaceDatabaseManager = new WorkspaceDatabaseManager()
  const workspaceDatabase = workspaceDatabaseManager.database
  const templateManagementRepository = new TemplateManagementRepository(workspaceDatabase)
  const workspaceRepository = new WorkspaceRepository(workspaceDatabase, appDatabase)
  const problemRepository = new ProblemRepository(workspaceDatabase)
  const workspaceStorage = new WorkspaceStorageManager()
  const workspaceRuntime = new WorkspaceRuntimeManager(
    workspaceDatabaseManager,
    workspaceRepository,
    workspaceStorage,
  )
  const workspaceService = new WorkspaceService(
    workspaceRepository,
    templateManagementRepository,
    app.getPath('userData'),
    workspaceRuntime,
  )
  await workspaceService.initializeActiveWorkspace()
  const aiProviderService = new AiProviderService(
    new AiProviderRepository(appDatabase),
    new SecretStore(app.getPath('userData')),
  )
  aiTaskRunRegistry = new AiTaskRunRegistry()
  backgroundTaskRegistry = new BackgroundTaskRegistry()
  const problemService = new ProblemService(
    problemRepository,
    app.getPath('userData'),
    workspaceRepository,
    workspaceStorage,
  )
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
    workspaceStorage,
  )
  const dataManagementService = new DataManagementService(
    workspaceDatabase,
    app.getPath('userData'),
    workspaceRepository,
    workspaceStorage,
  )
  const templateManagementService = new TemplateManagementService(
    aiProviderService,
    templateManagementRepository,
    workspaceRepository,
    workspaceService,
    app.getPath('userData'),
    workspaceAiContextService,
    aiTaskRunRegistry,
    dataManagementService.getLifecycleService(),
    dataManagementService.getFileExecutionIntegrityService(),
    workspaceStorage,
  )
  const templateExportService = new TemplateExportService(
    workspaceRepository,
    templateManagementRepository,
  )
  registerAppIpc()
  registerBackgroundTaskIpc(backgroundTaskRegistry)
  registerAiProviderIpc(aiProviderService)
  registerDataManagementIpc(
    dataManagementService,
    backgroundTaskRegistry,
    () => mainWindow ?? undefined,
  )
  registerProblemIpc(problemService, () => mainWindow ?? undefined)
  registerProblemAnalysisIpc(problemAnalysisService, () => mainWindow ?? undefined)
  registerWorkspaceIpc(
    workspaceService,
    backgroundTaskRegistry,
    () => mainWindow ?? undefined,
    async () => {
      const aiCancellation = aiTaskRunRegistry?.cancelAll() ?? Promise.resolve()
      const backgroundCancellation = backgroundTaskRegistry?.cancelAll() ?? Promise.resolve()
      await Promise.allSettled([aiCancellation, backgroundCancellation])
    },
  )
  registerTemplateExportIpc(templateExportService, () => mainWindow ?? undefined)
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
  const aiShutdown = aiTaskRunRegistry?.cancelAll() ?? Promise.resolve()
  aiTaskRunRegistry = null
  const backgroundShutdown = backgroundTaskRegistry?.cancelAll() ?? Promise.resolve()
  void Promise.allSettled([aiShutdown, backgroundShutdown]).finally(() => {
    backgroundTaskRegistry = null
    workspaceDatabaseManager?.close()
    workspaceDatabaseManager = null
    appDatabase?.close()
    appDatabase = null
    shutdownComplete = true
    app.quit()
  })
})

configureTestUserData()
void bootstrap().catch(error => {
  console.error('[bootstrap] local data initialization failed', error)
  dialog.showErrorBox('无法启动应用', '本地数据初始化失败，请重新启动应用。')
  app.quit()
})
