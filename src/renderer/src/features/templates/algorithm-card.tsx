import {
  AlertCircle,
  BookOpenText,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  FilePenLine,
  Link2,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type {
  Problem,
  RelationType,
  TemplateProblemSummary,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { TemplateActionRequest, TemplateSummary } from '@core/contracts/workspace'
import type { FileChangeMutationResult } from '@core/contracts/template-management'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { activeElementOrNull } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

import type { TemplateSourceState } from './use-template-source'
import { CodeViewer } from './code-viewer'
import { TemplateMetadataCard } from './template-metadata-card'
import { TemplateProblemRelationDialog } from './template-problem-relation-dialog'
import { TemplateRelocationDialog } from './template-relocation-dialog'

interface AlgorithmCardProps {
  onAction: (request: TemplateActionRequest) => void
  onClearProblemError: () => void
  onDelete: (templateId: string) => Promise<boolean>
  onOpenProblem: (problemId: string) => void
  onLoadMoreRelatedProblems: () => void
  onRelocated: (templateId: string, result: FileChangeMutationResult) => void
  onReload: () => void
  onSearchProblems: (query: string) => Promise<Problem[]>
  onUpsertProblemRelation: (request: UpsertProblemRelationRequest) => Promise<boolean>
  problemError: string | null
  problemTotalCount: number
  relatedProblems: TemplateProblemSummary[]
  relatedProblemError: string | null
  relatedProblemsHasMore: boolean
  relatedProblemTotalCount: number
  isLoadingRelatedProblems: boolean
  isProblemBusy: boolean
  sourceState: TemplateSourceState
  template: TemplateSummary | null
}

const relationLabels: Record<RelationType, string> = {
  alternative: '备选',
  recommended: '推荐',
  used: '实际使用',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

export function AlgorithmCard({
  onAction,
  onClearProblemError,
  onDelete,
  onOpenProblem,
  onLoadMoreRelatedProblems,
  onRelocated,
  onReload,
  onSearchProblems,
  onUpsertProblemRelation,
  problemError,
  problemTotalCount,
  relatedProblems,
  relatedProblemError,
  relatedProblemsHasMore,
  relatedProblemTotalCount,
  isLoadingRelatedProblems,
  isProblemBusy,
  sourceState,
  template,
}: AlgorithmCardProps) {
  const { t } = useI18n()
  const [relationDialogOpen, setRelationDialogOpen] = useState(false)
  const [relocationOpen, setRelocationOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const relationReturnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setConfirmDelete(false)
  }, [template?.id])

  if (!template) {
    return (
      <section className="relative grid min-h-0 place-items-center overflow-hidden bg-background p-8 text-center">
        <div
          aria-hidden="true"
          className="app-grid-texture pointer-events-none absolute inset-0 opacity-55"
        />
        <div className="relative max-w-sm rounded-3xl border border-border bg-panel/90 px-8 py-9 shadow-panel">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/10">
            <FileCode2 aria-hidden="true" className="size-6" />
          </span>
          <h2 className="mt-4 text-sm font-semibold">{t('选择一份算法模板')}</h2>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {t('从左侧模板树打开源码；搜索结果也会自动定位并展开对应目录。')}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background/75">
      <header
        aria-label={t('模板摘要')}
        className="relative overflow-hidden border-b border-primary/12 bg-panel px-5 py-4 shadow-xs"
      >
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div
          aria-hidden="true"
          className="absolute -right-12 -top-20 size-52 rounded-full bg-primary/8 blur-3xl"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="relative min-w-[180px] flex-1">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-primary">
              {t('当前模板')}
            </div>
            <div className="flex items-center gap-2.5">
              <h1 className="truncate text-xl font-semibold tracking-[-0.03em]">{template.name}</h1>
              <Badge tone="accent">{template.language}</Badge>
            </div>
            <p
              className="mt-1 truncate text-xs text-muted-foreground"
              title={template.relativePath}
            >
              {template.relativePath}
            </p>
          </div>
          <div className="relative flex max-w-full flex-wrap justify-end gap-2">
            <Button
              aria-label={`${t('重命名或移动模板')} ${template.name}`}
              disabled={isProblemBusy}
              onClick={() => setRelocationOpen(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <FilePenLine aria-hidden="true" className="size-4 text-primary" />
            </Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-2 py-1">
                <span className="text-[11px] text-red-600 dark:text-red-300">
                  {t('源文件将备份后删除')}
                </span>
                <Button
                  disabled={isProblemBusy}
                  onClick={() => void onDelete(template.id)}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {t('确认删除')}
                </Button>
                <Button
                  onClick={() => setConfirmDelete(false)}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  {t('取消')}
                </Button>
              </div>
            ) : (
              <Button
                aria-label={`${t('删除模板')} ${template.name}`}
                disabled={isProblemBusy}
                onClick={() => setConfirmDelete(true)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" className="size-4 text-red-500" />
              </Button>
            )}
            <Button
              onClick={() => onAction({ action: 'copy-source', templateId: template.id })}
              size="compact"
              type="button"
              variant="outline"
            >
              <Copy aria-hidden="true" className="size-3.5" />
              {t('复制源码')}
            </Button>
            <Button
              aria-label={t('在文件管理器中显示')}
              onClick={() => onAction({ action: 'reveal', templateId: template.id })}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
            </Button>
          </div>
        </div>

        <dl className="relative mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {[
            [t('文件类型'), template.extension],
            [t('文件大小'), formatBytes(template.sizeBytes)],
            [t('关联题目'), String(relatedProblemTotalCount)],
          ].map(([label, value]) => (
            <div className="flex items-center gap-1.5" key={label}>
              <dt>{label}</dt>
              <dd className="font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 lg:p-5">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <div>
            <h2 className="text-xs font-semibold">{t('模板源码')}</h2>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {t('只读查看 · 可切换 VS Code 主题')}
            </p>
          </div>
          <Button
            aria-label={t('重新读取源码')}
            onClick={onReload}
            size="icon"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
          </Button>
        </div>

        {sourceState.status === 'loading' && (
          <div className="min-h-0 flex-1 animate-pulse rounded-xl border border-border bg-muted/45" />
        )}
        {sourceState.status === 'error' && (
          <div className="grid min-h-0 flex-1 place-items-center rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <div>
              <AlertCircle aria-hidden="true" className="mx-auto size-6 text-red-500" />
              <p className="mt-3 text-sm font-medium">{t('源码读取失败')}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t(sourceState.message)}</p>
              <Button
                className="mt-4"
                onClick={onReload}
                size="compact"
                type="button"
                variant="outline"
              >
                {t('重试')}
              </Button>
            </div>
          </div>
        )}
        {sourceState.status === 'ready' && (
          <CodeViewer code={sourceState.value.content} language={sourceState.value.language} />
        )}

        <TemplateMetadataCard key={template.id} templateId={template.id} />

        <section className="mt-4 rounded-2xl border border-border bg-panel p-4 shadow-panel">
          <div className="flex items-center gap-2">
            <BookOpenText aria-hidden="true" className="size-4 text-muted-foreground" />
            <h2 className="text-xs font-semibold">{t('关联题目')}</h2>
            <Badge className="ml-auto">{relatedProblemTotalCount}</Badge>
            <Button
              disabled={isProblemBusy || problemTotalCount === 0}
              onClick={() => {
                relationReturnFocusRef.current = activeElementOrNull()
                onClearProblemError()
                setRelationDialogOpen(true)
              }}
              size="compact"
              type="button"
              variant="outline"
            >
              <Link2 aria-hidden="true" className="size-3.5" />
              {t('设置关联')}
            </Button>
          </div>
          {relatedProblems.length === 0 ? (
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              {t('还没有题目使用该模板。点击“设置关联”即可从题库中添加。')}
            </p>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {relatedProblems.map(problem => (
                <button
                  className="interactive-lift flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 text-left outline-none hover:border-primary/25 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring"
                  key={problem.id}
                  onClick={() => onOpenProblem(problem.id)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">{problem.title}</span>
                    <span className="mt-0.5 block text-[10px] text-muted-foreground">
                      {t(relationLabels[problem.relationType])}
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
          {relatedProblemError && (
            <p className="mt-3 text-[11px] text-red-600 dark:text-red-300" role="alert">
              {t(relatedProblemError)}
            </p>
          )}
          {relatedProblemsHasMore && (
            <div className="mt-3 rounded-xl border border-border bg-muted/25 p-3">
              <p className="text-[10px] leading-4 text-muted-foreground">
                {t('关联题目按最近修改时间分批加载。')} {relatedProblems.length} /{' '}
                {relatedProblemTotalCount}
              </p>
              <Button
                className="mt-2"
                disabled={isLoadingRelatedProblems}
                onClick={onLoadMoreRelatedProblems}
                size="compact"
                type="button"
                variant="outline"
              >
                {t('加载更多关联题目')}
              </Button>
            </div>
          )}
        </section>
      </div>
      <TemplateProblemRelationDialog
        error={problemError}
        isBusy={isProblemBusy}
        onOpenChange={open => {
          setRelationDialogOpen(open)
          if (!open) onClearProblemError()
        }}
        onSearchProblems={onSearchProblems}
        onSave={onUpsertProblemRelation}
        open={relationDialogOpen}
        returnFocusTo={relationReturnFocusRef.current}
        template={template}
      />
      <TemplateRelocationDialog
        onCompleted={onRelocated}
        onOpenChange={setRelocationOpen}
        open={relocationOpen}
        template={template}
      />
    </section>
  )
}
