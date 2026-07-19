import { LoaderCircle } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'

import type { ChooseWorkspaceRequest, TemplateActionRequest } from '@core/contracts/workspace'
import type { ImportTemplateRequest } from '@core/contracts/template-management'

import { AppDialogs } from '@/app/app-dialogs'
import { AppShell } from '@/app/app-shell'
import { ProblemWorkspace } from '@/features/problems/problem-workspace'
import { useProblems } from '@/features/problems/use-problems'
import { useTemplateSource } from '@/features/templates/use-template-source'
import { useWorkspace } from '@/features/templates/use-workspace'
import { WorkspaceOnboarding } from '@/features/templates/workspace-onboarding'
import { useRuntimeInfo } from '@/hooks/use-runtime-info'
import { useTheme } from '@/hooks/use-theme'
import { I18nProvider, useI18n } from '@/lib/i18n'
import { appViewLabels, type AppView, useAppKeyboardShortcuts } from '@/app/app-navigation'
import { resolveAppRoute } from '@/app/app-route'
import { useAppDialogs } from '@/app/use-app-dialogs'
import { WorkspaceUnavailable } from '@/app/workspace-unavailable'
import { Dashboard } from '@/features/dashboard/dashboard'
import { TemplateLibrary } from '@/features/templates/template-library'

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

function AppContent() {
  const [currentView, setCurrentView] = useState<AppView>('dashboard')
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingPlanCount, setPendingPlanCount] = useState(0)
  const [pageAnnouncement, setPageAnnouncement] = useState<string | null>(null)
  const [selectedProblemId, setSelectedProblemId] = useState<string | null>(null)
  const [revealTemplateId, setRevealTemplateId] = useState<string | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const dialogs = useAppDialogs()
  const { locale, t, toggleLocale } = useI18n()
  const runtimeState = useRuntimeInfo()
  const { theme, toggleTheme } = useTheme()
  const problemState = useProblems()
  const loadProblem = problemState.loadProblem
  const loadedProblems = problemState.problems
  const {
    cancelRescan,
    chooseWorkspace,
    clearError: clearWorkspaceError,
    deleteTemplate,
    error: workspaceError,
    isBusy: isWorkspaceBusy,
    isLoading: isWorkspaceLoading,
    isLoadingMoreTemplates,
    loadMoreTemplates,
    loadTemplate,
    performTemplateAction,
    replaceWorkspace,
    importTemplate,
    rescan,
    scanTask,
    searchTemplates,
    workspace,
  } = useWorkspace()
  const source = useTemplateSource(selectedTemplateId)

  const openCommandPalette = dialogs.openCommandPalette
  const openCreateDialog = dialogs.openCreateDialog

  const selectedTemplate = useMemo(
    () => workspace?.templates.find(template => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, workspace],
  )

  useEffect(() => {
    if (currentView !== 'templates') setRevealTemplateId(null)
  }, [currentView])

  useAppKeyboardShortcuts({
    onNavigate: setCurrentView,
    onOpenCommand: openCommandPalette,
    onOpenCreate: openCreateDialog,
    workspaceAvailable: Boolean(workspace?.available),
  })

  useEffect(() => {
    setPageAnnouncement(t('已切换到 {page}', { page: t(appViewLabels[currentView]) }))
  }, [currentView, t])

  useEffect(() => {
    if (
      selectedTemplateId &&
      workspace &&
      !workspace.templatePage.truncated &&
      !workspace.templates.some(template => template.id === selectedTemplateId)
    ) {
      setSelectedTemplateId(null)
    }
  }, [selectedTemplateId, workspace])

  useEffect(() => {
    if (!selectedProblemId || loadedProblems.some(problem => problem.id === selectedProblemId))
      return
    void loadProblem(selectedProblemId).then(problem => {
      if (!problem) setSelectedProblemId(null)
    })
  }, [loadProblem, loadedProblems, selectedProblemId])

  useEffect(() => {
    if (currentView === 'problems' && !selectedProblemId && problemState.problems[0]) {
      setSelectedProblemId(problemState.problems[0].id)
    }
  }, [currentView, problemState.problems, selectedProblemId])

  useEffect(() => {
    let active = true
    if (!workspace) {
      setPendingPlanCount(0)
      return
    }
    if (currentView !== 'dashboard') return
    void window.desktop.templateManagement
      .listFilePlansPage({ cursor: null, limit: 100 })
      .then(planPage => {
        if (active) setPendingPlanCount(planPage.draftCount)
      })
      .catch(() => {
        if (active) setPendingPlanCount(0)
      })
    return () => {
      active = false
    }
  }, [currentView, workspace])

  useEffect(() => {
    if (!notice) {
      return
    }
    const timer = window.setTimeout(() => setNotice(null), 2400)
    return () => window.clearTimeout(timer)
  }, [notice])

  const handleChooseWorkspace = async (request: ChooseWorkspaceRequest) => {
    const value = await chooseWorkspace(request)
    if (value) {
      setCurrentView('templates')
      setSelectedTemplateId(null)
      setNotice(t('已连接工作区“{name}”', { name: value.name }))
    }
  }

  const handleRescan = async () => {
    const value = await rescan()
    if (value) {
      setNotice(t('扫描完成：发现 {count} 个模板', { count: value.summary.templateCount }))
    }
  }

  const handleCreateTemplate = async (request: ImportTemplateRequest) => {
    const result = await importTemplate(request)
    if (!result) {
      return false
    }
    setCurrentView('templates')
    setSelectedTemplateId(result.templateId)
    void loadTemplate(result.templateId)
    setNotice(t('已创建 {path}', { path: request.relativePath }))
    return true
  }

  const handleTemplateAction = async (request: TemplateActionRequest) => {
    const succeeded = await performTemplateAction(request)
    if (succeeded) {
      const messageByAction = {
        'copy-relative-path': t('已复制相对路径'),
        'copy-source': t('已复制模板源码'),
        reveal: t('已在文件管理器中定位'),
      }
      setNotice(messageByAction[request.action])
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    const result = await deleteTemplate(templateId)
    if (!result) return false
    setSelectedTemplateId(null)
    void problemState.reload()
    setNotice(t('模板已备份并删除，可在 AI 管理的执行记录中撤销'))
    return true
  }

  const openTemplate = (templateId: string) => {
    setCurrentView('templates')
    void loadTemplate(templateId).then(template => {
      if (!template) return
      setRevealTemplateId(templateId)
      setSelectedTemplateId(templateId)
    })
  }

  const openProblem = (problemId: string) => {
    setCurrentView('problems')
    setSelectedProblemId(problemId)
  }

  const renderContent = () => {
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
            onOpenSettings={() => setCurrentView('settings')}
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
            setNotice(t('模板已安全重命名或移动，并保留原有元数据与题目关联'))
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
        onOpenAi={() => setCurrentView('ai')}
        onOpenProblem={openProblem}
        onOpenProblems={() => setCurrentView('problems')}
        onOpenTemplate={openTemplate}
        onOpenTemplates={() => setCurrentView('templates')}
        pendingPlanCount={pendingPlanCount}
        problemTotalCount={problemState.totalCount}
        problems={problemState.problems}
        totalRelationCount={problemState.totalRelationCount}
        workspace={workspace}
      />
    )
  }

  return (
    <AppShell
      currentView={currentView}
      locale={locale}
      notice={notice}
      onClearNotice={() => setNotice(null)}
      onClearWorkspaceError={clearWorkspaceError}
      onLayoutReset={() => setNotice(t('布局已恢复默认值'))}
      onNavigate={setCurrentView}
      onOpenCommand={openCommandPalette}
      onOpenCreate={openCreateDialog}
      onToggleLocale={toggleLocale}
      onToggleTheme={toggleTheme}
      overlays={
        <AppDialogs
          commandPalette={{
            onOpenChange: dialogs.setCommandOpen,
            onSearchProblems: problemState.searchProblems,
            onSearchTemplates: searchTemplates,
            onSelectProblem: openProblem,
            onSelectTemplate: openTemplate,
            open: dialogs.commandOpen,
            problems: problemState.problems,
            problemTotalCount: problemState.totalCount,
            returnFocusTo: dialogs.commandReturnFocusRef.current,
            templateTotalCount: workspace?.summary.templateCount ?? 0,
            templates: workspace?.templates ?? [],
          }}
          createTemplate={{
            error: workspaceError,
            isBusy: isWorkspaceBusy,
            onBatchComplete: result => {
              replaceWorkspace(result.workspace)
              setCurrentView('templates')
              const firstTemplateId = result.imported[0]?.templateId ?? null
              setSelectedTemplateId(firstTemplateId)
              if (firstTemplateId) void loadTemplate(firstTemplateId)
              setNotice(t('已批量导入 {count} 份 C++ 模板', { count: result.imported.length }))
            },
            onCreate: handleCreateTemplate,
            onOpenChange: open => {
              dialogs.setCreateOpen(open)
              if (!open) clearWorkspaceError()
            },
            open: dialogs.createOpen,
            returnFocusTo: dialogs.createReturnFocusRef.current,
          }}
        />
      }
      pageAnnouncement={pageAnnouncement}
      problemTotalCount={problemState.totalCount}
      runtimeState={runtimeState}
      theme={theme}
      workspace={workspace}
      workspaceError={workspaceError}
    >
      {renderContent()}
    </AppShell>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  )
}
