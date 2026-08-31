import {
  Download,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import type {
  Problem,
  TemplateProblemSummary,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type { FileChangeMutationResult } from '@core/contracts/template-management'
import type {
  ApplyTemplateSourceEditResult,
  TemplateActionRequest,
  TemplatePage,
  TemplateSummary,
  WorkspaceSnapshot,
} from '@core/contracts/workspace'

import { ResizableLayout } from '@/components/resizable-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { layoutPreferenceKeys } from '@/hooks/use-layout-preference'
import { backgroundTaskProgressText } from '@/lib/background-task'
import { activeElementOrNull } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { TemplateTree } from './template-tree'
import { TemplateMetadataCompletionDialog } from './template-metadata-completion-dialog'
import { TemplateExportDialog } from './template-export-dialog'
import { useTemplateSource } from './use-template-source'

const AlgorithmCard = lazy(async () => {
  const module = await import('./algorithm-card')
  return { default: module.AlgorithmCard }
})

export function TemplateLibrary({
  isBusy,
  isProblemBusy,
  isLoadingMoreTemplates,
  onAction,
  onChangeWorkspace,
  onClearProblemError,
  onCancelRescan,
  onCreateTemplate,
  onDeleteTemplate,
  onOpenProblem,
  onLoadMoreTemplates,
  onRescan,
  scanTask,
  onSelectTemplate,
  onUpsertProblemRelation,
  problemError,
  revealTemplateId,
  selectedTemplate,
  selectedTemplateId,
  sourceState,
  onReloadSource,
  onRelocated,
  onSourceEdited,
  onSearchProblems,
  onSearchTemplates,
  problemTotalCount,
  workspace,
}: {
  isBusy: boolean
  isProblemBusy: boolean
  isLoadingMoreTemplates: boolean
  onAction: (request: TemplateActionRequest) => void
  onChangeWorkspace: () => void
  onClearProblemError: () => void
  onCancelRescan: () => void
  onCreateTemplate: () => void
  onDeleteTemplate: (templateId: string) => Promise<boolean>
  onOpenProblem: (problemId: string) => void
  onLoadMoreTemplates: () => void
  onReloadSource: () => void
  onRelocated: (templateId: string, result: FileChangeMutationResult) => void
  onSourceEdited: (templateId: string, result: ApplyTemplateSourceEditResult) => void
  onSearchProblems: (query: string) => Promise<Problem[]>
  onSearchTemplates: (query: string) => Promise<TemplatePage>
  onRescan: () => void
  onSelectTemplate: (templateId: string) => void
  onUpsertProblemRelation: (request: UpsertProblemRelationRequest) => Promise<boolean>
  problemError: string | null
  problemTotalCount: number
  revealTemplateId: string | null
  scanTask: BackgroundTaskStatus | null
  selectedTemplate: TemplateSummary | null
  selectedTemplateId: string | null
  sourceState: ReturnType<typeof useTemplateSource>['state']
  workspace: WorkspaceSnapshot
}) {
  const { t } = useI18n()
  const relatedTemplateIdRef = useRef<string | null>(selectedTemplate?.id ?? null)
  const [isLoadingRelatedProblems, setIsLoadingRelatedProblems] = useState(false)
  const [relatedProblemCursor, setRelatedProblemCursor] = useState<string | null>(null)
  const [relatedProblemError, setRelatedProblemError] = useState<string | null>(null)
  const [relatedProblems, setRelatedProblems] = useState<TemplateProblemSummary[]>([])
  const [relatedProblemTotalCount, setRelatedProblemTotalCount] = useState(0)
  const [metadataCompletion, setMetadataCompletion] = useState<{
    initialTemplate: TemplateSummary | null
    returnFocusTo: HTMLElement | null
  } | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportReturnFocusRef = useRef<HTMLElement | null>(null)
  const [metadataRefreshKey, setMetadataRefreshKey] = useState(0)
  relatedTemplateIdRef.current = selectedTemplate?.id ?? null

  const loadRelatedProblems = useCallback(
    async (templateId: string, cursor: string | null, append: boolean) => {
      setIsLoadingRelatedProblems(true)
      setRelatedProblemError(null)
      try {
        const page = await window.desktop.problems.listByTemplate({
          cursor,
          limit: 100,
          templateId,
        })
        if (relatedTemplateIdRef.current !== templateId) return
        setRelatedProblems(current => {
          if (!append) return page.items
          const known = new Set(current.map(problem => problem.id))
          return [...current, ...page.items.filter(problem => !known.has(problem.id))]
        })
        setRelatedProblemCursor(page.nextCursor)
        setRelatedProblemTotalCount(page.totalCount)
      } catch (error) {
        if (relatedTemplateIdRef.current === templateId) {
          setRelatedProblemError(
            error instanceof Error ? error.message : '关联题目读取失败，请重试。',
          )
        }
      } finally {
        if (relatedTemplateIdRef.current === templateId) setIsLoadingRelatedProblems(false)
      }
    },
    [],
  )

  useEffect(() => {
    const templateId = selectedTemplate?.id
    setRelatedProblems([])
    setRelatedProblemCursor(null)
    setRelatedProblemError(null)
    setRelatedProblemTotalCount(0)
    if (!templateId) return
    void loadRelatedProblems(templateId, null, false)
  }, [loadRelatedProblems, selectedTemplate?.id])

  const handleUpsertProblemRelation = async (request: UpsertProblemRelationRequest) => {
    const saved = await onUpsertProblemRelation(request)
    if (saved && selectedTemplate?.id === request.templateId) {
      await loadRelatedProblems(request.templateId, null, false)
    }
    return saved
  }
  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-cyan/12 text-accent-cyan ring-1 ring-accent-cyan/14">
          <FileCode2 aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[15px] font-semibold tracking-tight">{t('模板库')}</h1>
            <Badge tone="accent">
              {workspace.summary.templateCount} {t('个模板')}
            </Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            {scanTask && ['queued', 'running', 'cancelling'].includes(scanTask.state)
              ? backgroundTaskProgressText(scanTask, t)
              : `${workspace.name} · ${t('本地索引')}`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            disabled={isBusy}
            onClick={onChangeWorkspace}
            size="compact"
            type="button"
            variant="ghost"
          >
            <FolderOpen aria-hidden="true" className="size-3.5" />
            {t('切换工作区')}
          </Button>
          <Button
            disabled={isBusy}
            onClick={() => {
              exportReturnFocusRef.current = activeElementOrNull()
              setExportOpen(true)
            }}
            size="compact"
            type="button"
            variant="subtle"
          >
            <Download aria-hidden="true" className="size-3.5" />
            {t('导出模板册')}
          </Button>
          {scanTask && ['queued', 'running', 'cancelling'].includes(scanTask.state) && (
            <Button onClick={onCancelRescan} size="compact" type="button" variant="outline">
              <X aria-hidden="true" className="size-3.5" />
              {t('取消扫描')}
            </Button>
          )}
          <Button
            aria-label={t('重新扫描工作区')}
            disabled={isBusy}
            onClick={onRescan}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={cn('size-4', isBusy && 'animate-spin')} />
          </Button>
          <Button
            disabled={isBusy}
            onClick={() =>
              setMetadataCompletion({
                initialTemplate: null,
                returnFocusTo: activeElementOrNull(),
              })
            }
            size="compact"
            type="button"
            variant="outline"
          >
            <Sparkles aria-hidden="true" className="size-3.5" />
            {t('批量补全元数据')}
          </Button>
          <Button disabled={isBusy} onClick={onCreateTemplate} size="compact" type="button">
            <Plus aria-hidden="true" className="size-3.5" />
            {t('新建模板')}
          </Button>
        </div>
      </header>

      <ResizableLayout
        className="min-h-0 flex-1"
        defaultPrimarySize={292}
        maximumPrimarySize={420}
        minimumPrimarySize={220}
        minimumSecondarySize={360}
        primaryLabel={t('模板树面板')}
        secondaryLabel={t('模板详情面板')}
        separatorLabel={t('调整模板树宽度')}
        storageKey={layoutPreferenceKeys.templateLibrary}
        valueText={size => t('模板树宽度 {size} 像素', { size })}
      >
        <TemplateTree
          hasMore={Boolean(workspace.templatePage.nextCursor)}
          isLoadingMore={isLoadingMoreTemplates}
          onAction={onAction}
          onLoadMore={onLoadMoreTemplates}
          onSearch={onSearchTemplates}
          onSelect={onSelectTemplate}
          revealTemplateId={revealTemplateId}
          selectedTemplateId={selectedTemplateId}
          templates={workspace.templates}
          totalCount={workspace.summary.templateCount}
          workspaceId={workspace.id}
        />
        <Suspense
          fallback={
            <section className="grid h-full min-h-0 place-items-center bg-background">
              <div className="text-center">
                <LoaderCircle className="mx-auto size-5 animate-spin text-primary" />
                <p className="mt-2 text-xs text-muted-foreground">{t('正在准备源码查看器…')}</p>
              </div>
            </section>
          }
        >
          <AlgorithmCard
            metadataRefreshKey={metadataRefreshKey}
            onAction={onAction}
            onDelete={onDeleteTemplate}
            isProblemBusy={isProblemBusy || isBusy}
            isLoadingRelatedProblems={isLoadingRelatedProblems}
            onClearProblemError={onClearProblemError}
            onCompleteMetadata={() => {
              if (!selectedTemplate) return
              setMetadataCompletion({
                initialTemplate: selectedTemplate,
                returnFocusTo: activeElementOrNull(),
              })
            }}
            onLoadMoreRelatedProblems={() => {
              if (selectedTemplate && relatedProblemCursor) {
                void loadRelatedProblems(selectedTemplate.id, relatedProblemCursor, true)
              }
            }}
            onOpenProblem={onOpenProblem}
            onReload={onReloadSource}
            onRelocated={onRelocated}
            onSourceEdited={onSourceEdited}
            onSearchProblems={onSearchProblems}
            onUpsertProblemRelation={handleUpsertProblemRelation}
            problemError={problemError}
            problemTotalCount={problemTotalCount}
            relatedProblems={relatedProblems}
            relatedProblemsHasMore={Boolean(relatedProblemCursor)}
            relatedProblemError={relatedProblemError}
            relatedProblemTotalCount={relatedProblemTotalCount}
            sourceState={sourceState}
            template={selectedTemplate}
          />
        </Suspense>
      </ResizableLayout>
      {metadataCompletion && (
        <TemplateMetadataCompletionDialog
          initialTemplate={metadataCompletion.initialTemplate}
          onApplied={() => setMetadataRefreshKey(key => key + 1)}
          onClose={() => setMetadataCompletion(null)}
          returnFocusTo={metadataCompletion.returnFocusTo}
        />
      )}
      <TemplateExportDialog
        onOpenChange={setExportOpen}
        open={exportOpen}
        returnFocusTo={exportReturnFocusRef.current}
        templates={workspace.templates}
      />
    </main>
  )
}
