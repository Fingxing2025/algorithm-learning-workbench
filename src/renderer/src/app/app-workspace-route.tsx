import { LoaderCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'

import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type {
  TemplateActionRequest,
  TemplatePage,
  TemplateSummary,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'

import { WorkspaceUnavailable } from '@/app/workspace-unavailable'
import type { AppView } from '@/app/app-navigation'
import { resolveAppRoute } from '@/app/app-route'
import { Dashboard } from '@/features/dashboard/dashboard'
import { ProblemWorkspace } from '@/features/problems/problem-workspace'
import { TemplateLibrary } from '@/features/templates/template-library'
import { WorkspaceOnboarding } from '@/features/templates/workspace-onboarding'
import { useProblems } from '@/features/problems/use-problems'
import { useTemplateSource } from '@/features/templates/use-template-source'
import { useI18n } from '@/lib/i18n'

const FileManagementWorkspace = lazy(async () => {
  const module = await import('@/features/ai/file-management-workspace')
  return { default: module.FileManagementWorkspace }
})

const AiProviderWorkspace = lazy(async () => {
  const module = await import('@/features/ai/ai-provider-workspace')
  return { default: module.AiProviderWorkspace }
})

const DataManagementWorkspace = lazy(async () => {
  const module = await import('@/features/data/data-management-workspace')
  return { default: module.DataManagementWorkspace }
})

type AppTranslate = ReturnType<typeof useI18n>['t']

export interface AppWorkspaceRouteProps {
  cancelRescan: () => Promise<boolean>
  currentView: AppView
  handleChooseWorkspace: (request: { intent: 'create' | 'open' }) => void
  handleDeleteTemplate: (templateId: string) => Promise<boolean>
  handleRescan: () => void
  handleTemplateAction: (request: TemplateActionRequest) => void
  isLoadingMoreTemplates: boolean
  isWorkspaceBusy: boolean
  isWorkspaceLoading: boolean
  loadMoreTemplates: () => void
  loadTemplate: (templateId: string) => Promise<TemplateSummary | null>
  onNavigate: (view: AppView) => void
  onNotice: (message: string) => void
  openCreateDialog: () => void
  openProblem: (problemId: string) => void
  openTemplate: (templateId: string) => void
  pendingPlanCount: number
  problemState: ReturnType<typeof useProblems>
  replaceWorkspace: (workspace: WorkspaceSnapshot) => void
  revealTemplateId: string | null
  scanTask: BackgroundTaskStatus | null
  searchTemplates: (query: string) => Promise<TemplatePage>
  selectedProblemId: string | null
  selectedTemplate: TemplateSummary | null
  selectedTemplateId: string | null
  setSelectedProblemId: (problemId: string | null) => void
  setSelectedTemplateId: (templateId: string | null) => void
  source: ReturnType<typeof useTemplateSource>
  t: AppTranslate
  workspace: WorkspaceSnapshot | null
  workspaceError: string | null
}

export function AppWorkspaceRoute({
  cancelRescan,
  currentView,
  handleChooseWorkspace,
  handleDeleteTemplate,
  handleRescan,
  handleTemplateAction,
  isLoadingMoreTemplates,
  isWorkspaceBusy,
  isWorkspaceLoading,
  loadMoreTemplates,
  loadTemplate,
  onNavigate,
  onNotice,
  openCreateDialog,
  openProblem,
  openTemplate,
  pendingPlanCount,
  problemState,
  replaceWorkspace,
  revealTemplateId,
  scanTask,
  searchTemplates,
  selectedProblemId,
  selectedTemplate,
  selectedTemplateId,
  setSelectedProblemId,
  setSelectedTemplateId,
  source,
  t,
  workspace,
  workspaceError,
}: AppWorkspaceRouteProps) {
  const route = resolveAppRoute({ currentView, isWorkspaceLoading, workspace })
  if (route === 'ai') {
    return (
      <Suspense
        fallback={
          <main className="grid h-full min-h-0 place-items-center">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium">{t('正在打开文件 AI 管理…')}</p>
            </div>
          </main>
        }
      >
        <FileManagementWorkspace
          onOpenSettings={() => onNavigate('settings')}
          onWorkspaceChanged={value => {
            replaceWorkspace(value)
            void problemState.reload()
          }}
          workspace={workspace}
        />
      </Suspense>
    )
  }

  if (route === 'settings') {
    return (
      <Suspense
        fallback={
          <main className="grid h-full min-h-0 place-items-center">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium">{t('正在打开 AI 设置…')}</p>
            </div>
          </main>
        }
      >
        <AiProviderWorkspace />
      </Suspense>
    )
  }

  if (route === 'data') {
    return (
      <Suspense
        fallback={
          <main className="grid h-full min-h-0 place-items-center">
            <div className="text-center">
              <LoaderCircle className="mx-auto size-6 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium">{t('正在打开数据管理…')}</p>
            </div>
          </main>
        }
      >
        <DataManagementWorkspace />
      </Suspense>
    )
  }

  if (route === 'loading') {
    return (
      <main className="grid min-h-0 place-items-center">
        <div className="text-center">
          <LoaderCircle aria-hidden="true" className="mx-auto size-6 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium">{t('正在读取本地工作区…')}</p>
        </div>
      </main>
    )
  }

  if (route === 'onboarding' || !workspace) {
    return (
      <WorkspaceOnboarding
        error={workspaceError}
        isBusy={isWorkspaceBusy}
        onChoose={request => void handleChooseWorkspace(request)}
      />
    )
  }

  if (route === 'unavailable') {
    return (
      <WorkspaceUnavailable
        isBusy={isWorkspaceBusy}
        onChoose={request => void handleChooseWorkspace(request)}
        workspace={workspace}
      />
    )
  }

  if (route === 'templates') {
    return (
      <TemplateLibrary
        isBusy={isWorkspaceBusy}
        isLoadingMoreTemplates={isLoadingMoreTemplates}
        isProblemBusy={problemState.isBusy}
        onAction={request => void handleTemplateAction(request)}
        onChangeWorkspace={() => void handleChooseWorkspace({ intent: 'open' })}
        onClearProblemError={problemState.clearError}
        onCancelRescan={() => void cancelRescan()}
        onCreateTemplate={openCreateDialog}
        onDeleteTemplate={handleDeleteTemplate}
        onOpenProblem={openProblem}
        onLoadMoreTemplates={() => void loadMoreTemplates()}
        onReloadSource={source.reload}
        onRelocated={(templateId, result) => {
          replaceWorkspace(result.workspace)
          setSelectedTemplateId(templateId)
          void loadTemplate(templateId)
          source.reload()
          void problemState.reload()
          onNotice(t('模板已安全重命名或移动，并保留原有元数据与题目关联'))
        }}
        onSourceEdited={(templateId, result) => {
          replaceWorkspace(result.workspace)
          setSelectedTemplateId(templateId)
          void loadTemplate(templateId)
          source.reload()
          void problemState.reload()
          onNotice(
            t(
              result.backupCleanupPending
                ? '模板源码已保存；事务备份稍后可在数据管理中清理'
                : '模板源码已安全保存，并保留原有元数据与题目关联',
            ),
          )
        }}
        onSearchProblems={problemState.searchProblems}
        onSearchTemplates={searchTemplates}
        onRescan={() => void handleRescan()}
        onSelectTemplate={templateId => {
          openTemplate(templateId)
        }}
        onUpsertProblemRelation={async request =>
          Boolean(await problemState.upsertRelation(request))
        }
        problemError={problemState.error}
        problemTotalCount={problemState.totalCount}
        revealTemplateId={revealTemplateId}
        scanTask={scanTask}
        selectedTemplate={selectedTemplate}
        selectedTemplateId={selectedTemplateId}
        sourceState={source.state}
        workspace={workspace}
      />
    )
  }

  if (route === 'problems') {
    return (
      <ProblemWorkspace
        error={problemState.error}
        isBusy={problemState.isBusy}
        isLoading={problemState.isLoading}
        isLoadingMore={problemState.isLoadingMore}
        matchedCount={problemState.matchedCount}
        hasMore={problemState.hasMore}
        onAddImages={problemState.addImages}
        onAnalysisCreated={problemState.acceptProblem}
        onClearError={problemState.clearError}
        onDelete={problemState.deleteProblem}
        onOpenTemplate={openTemplate}
        onLoadMore={problemState.loadMore}
        onRemoveImage={problemState.removeImage}
        onRemoveRelation={problemState.removeRelation}
        onSelect={setSelectedProblemId}
        onSearch={problemState.search}
        onSearchTemplates={searchTemplates}
        onUpdate={problemState.updateProblem}
        onUpsertRelation={problemState.upsertRelation}
        problems={problemState.problems}
        selectedProblemId={selectedProblemId}
        templates={workspace.templates}
        templateTotalCount={workspace.summary.templateCount}
        totalCount={problemState.totalCount}
      />
    )
  }

  return (
    <Dashboard
      onCreateTemplate={openCreateDialog}
      onOpenAi={() => onNavigate('ai')}
      onOpenProblem={openProblem}
      onOpenProblems={() => onNavigate('problems')}
      onOpenTemplate={openTemplate}
      onOpenTemplates={() => onNavigate('templates')}
      pendingPlanCount={pendingPlanCount}
      problemTotalCount={problemState.totalCount}
      problems={problemState.problems}
      totalRelationCount={problemState.totalRelationCount}
      workspace={workspace}
    />
  )
}
