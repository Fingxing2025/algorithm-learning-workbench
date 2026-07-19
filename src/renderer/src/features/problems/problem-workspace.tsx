import {
  AlertTriangle,
  BookOpenText,
  Check,
  Edit3,
  FileImage,
  FileText,
  ImagePlus,
  Link2,
  LoaderCircle,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type {
  CreateProblemRequest,
  Problem,
  ProblemTemplateRelation,
  RemoveProblemImageRequest,
  RemoveProblemRelationRequest,
  UpdateProblemRequest,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'
import type { TemplatePage } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ResizableLayout } from '@/components/resizable-layout'
import { layoutPreferenceKeys } from '@/hooks/use-layout-preference'
import { activeElementOrNull } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { ProblemEditorDialog } from './problem-editor-dialog'
import { ProblemImageCard } from './problem-image-card'
import { problemStatusLabels, relationTypeLabels } from './problem-labels'
import { RelationDialog } from './relation-dialog'

const ProblemAnalysisDialog = lazy(async () => {
  const module = await import('./problem-analysis-dialog')
  return { default: module.ProblemAnalysisDialog }
})

interface ProblemWorkspaceProps {
  error: string | null
  isBusy: boolean
  isLoading: boolean
  isLoadingMore: boolean
  matchedCount: number
  hasMore: boolean
  onAddImages: (problemId: string) => Promise<Problem | null>
  onAnalysisCreated: (problem: Problem) => Problem
  onClearError: () => void
  onDelete: (problemId: string) => Promise<boolean>
  onOpenTemplate: (templateId: string) => void
  onLoadMore: () => Promise<Problem[] | null>
  onRemoveImage: (request: RemoveProblemImageRequest) => Promise<Problem | null>
  onRemoveRelation: (request: RemoveProblemRelationRequest) => Promise<Problem | null>
  onSelect: (problemId: string | null) => void
  onSearch: (query: string) => Promise<Problem[] | null>
  onSearchTemplates: (query: string) => Promise<TemplatePage>
  onUpdate: (request: UpdateProblemRequest) => Promise<Problem | null>
  onUpsertRelation: (request: UpsertProblemRelationRequest) => Promise<Problem | null>
  problems: Problem[]
  selectedProblemId: string | null
  templates: TemplateSummary[]
  templateTotalCount: number
  totalCount: number
}

function formatUpdatedAt(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(value))
}

export function ProblemWorkspace({
  error,
  isBusy,
  isLoading,
  isLoadingMore,
  matchedCount,
  hasMore,
  onAddImages,
  onAnalysisCreated,
  onClearError,
  onDelete,
  onOpenTemplate,
  onLoadMore,
  onRemoveImage,
  onRemoveRelation,
  onSelect,
  onSearch,
  onSearchTemplates,
  onUpdate,
  onUpsertRelation,
  problems,
  selectedProblemId,
  templates,
  templateTotalCount,
  totalCount,
}: ProblemWorkspaceProps) {
  const { locale, t } = useI18n()
  const [confirmRemoveTemplateId, setConfirmRemoveTemplateId] = useState<string | null>(null)
  const [confirmDeleteProblem, setConfirmDeleteProblem] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingProblem, setEditingProblem] = useState<Problem | null>(null)
  const [query, setQuery] = useState('')
  const [relationEditorOpen, setRelationEditorOpen] = useState(false)
  const [editingRelation, setEditingRelation] = useState<ProblemTemplateRelation | null>(null)
  const [focusedProblemIndex, setFocusedProblemIndex] = useState(0)
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null)
  const listScrollRef = useRef<HTMLDivElement | null>(null)
  const submittedQueryRef = useRef('')

  useEffect(() => {
    setConfirmDeleteProblem(false)
    setConfirmRemoveTemplateId(null)
  }, [selectedProblemId])

  useEffect(() => {
    if (query === submittedQueryRef.current) return
    const timer = window.setTimeout(() => {
      submittedQueryRef.current = query
      void onSearch(query)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [onSearch, query])

  const selectedProblem = problems.find(problem => problem.id === selectedProblemId) ?? null
  const filteredProblems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) {
      return problems
    }
    return problems.filter(problem =>
      [
        problem.title,
        problem.platform,
        problem.problemCode,
        problem.difficulty,
        problem.tags.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('zh-CN')
        .includes(normalized),
    )
  }, [problems, query])
  const problemListVirtualizer = useVirtualizer({
    count: filteredProblems.length,
    estimateSize: () => 88,
    getScrollElement: () => listScrollRef.current,
    getItemKey: index => filteredProblems[index]?.id ?? index,
    overscan: 8,
  })

  useEffect(() => {
    if (filteredProblems.length === 0) {
      setFocusedProblemIndex(0)
      return
    }
    const selectedIndex = filteredProblems.findIndex(problem => problem.id === selectedProblemId)
    if (selectedIndex >= 0) {
      setFocusedProblemIndex(selectedIndex)
      if (filteredProblems.length > 100) {
        problemListVirtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
      } else {
        listScrollRef.current
          ?.querySelector<HTMLElement>(`#problem-list-option-${selectedProblemId}`)
          ?.scrollIntoView?.({ block: 'nearest' })
      }
    } else {
      setFocusedProblemIndex(current => Math.min(current, filteredProblems.length - 1))
    }
  }, [filteredProblems, problemListVirtualizer, selectedProblemId])

  const focusProblem = (index: number) => {
    const nextIndex = Math.min(filteredProblems.length - 1, Math.max(0, index))
    setFocusedProblemIndex(nextIndex)
    if (filteredProblems.length > 100) {
      problemListVirtualizer.scrollToIndex(nextIndex, { align: 'auto' })
    } else {
      listScrollRef.current
        ?.querySelector<HTMLElement>(`#problem-list-option-${filteredProblems[nextIndex]?.id}`)
        ?.scrollIntoView?.({ block: 'nearest' })
    }
  }

  const handleProblemListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (filteredProblems.length === 0) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusProblem(focusedProblemIndex + (event.key === 'ArrowDown' ? 1 : -1))
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusProblem(event.key === 'Home' ? 0 : filteredProblems.length - 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const problem = filteredProblems[focusedProblemIndex]
      if (problem) {
        event.preventDefault()
        onSelect(problem.id)
      }
    }
  }

  const relatedTemplateIds = useMemo(
    () => selectedProblem?.relations.map(relation => relation.templateId) ?? [],
    [selectedProblem],
  )

  const openCreateEditor = () => {
    dialogReturnFocusRef.current = activeElementOrNull()
    onClearError()
    setAnalysisOpen(true)
  }

  const openEditEditor = () => {
    if (!selectedProblem) {
      return
    }
    dialogReturnFocusRef.current = activeElementOrNull()
    onClearError()
    setEditingProblem(selectedProblem)
    setEditorOpen(true)
  }

  const handleSaveProblem = async (fields: CreateProblemRequest) => {
    if (!editingProblem) return false
    const saved = await onUpdate({ ...fields, id: editingProblem.id })
    if (saved) {
      onSelect(saved.id)
      return true
    }
    return false
  }

  const openRelationEditor = (relation: ProblemTemplateRelation | null) => {
    dialogReturnFocusRef.current = activeElementOrNull()
    onClearError()
    setEditingRelation(relation)
    setRelationEditorOpen(true)
  }

  const handleSaveRelation = async (request: UpsertProblemRelationRequest) =>
    Boolean(await onUpsertRelation(request))

  const renderProblemButton = (problem: Problem, index: number, fixedHeight: boolean) => {
    const selected = problem.id === selectedProblemId
    return (
      <button
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left outline-none transition-all focus-visible:ring-2 focus-visible:ring-success',
          fixedHeight && 'h-[84px]',
          selected
            ? 'border-success/15 bg-success/10 text-foreground shadow-xs'
            : index === focusedProblemIndex
              ? 'border-border bg-panel text-foreground'
              : 'border-transparent text-foreground hover:translate-x-0.5 hover:border-border hover:bg-panel',
        )}
        onClick={() => {
          setFocusedProblemIndex(index)
          onSelect(problem.id)
        }}
        tabIndex={-1}
        type="button"
      >
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
            selected
              ? 'bg-success/13 text-success ring-1 ring-success/12'
              : 'bg-muted text-muted-foreground',
          )}
        >
          <BookOpenText aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{problem.title}</span>
          <span className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
            {problem.platform ?? t('未设置平台')}
            {problem.problemCode && ` · ${problem.problemCode}`}
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{t(problemStatusLabels[problem.status])}</span>
            <span>
              {problem.relations.length} {t('个模板')}
            </span>
            <span className="ml-auto">{formatUpdatedAt(problem.updatedAt, locale)}</span>
          </span>
        </span>
      </button>
    )
  }

  return (
    <main className="workspace-stage flex h-full min-h-0 flex-col overflow-hidden">
      <header className="glass-section-header flex min-h-[62px] flex-wrap items-center gap-3 border-b px-5 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
          <BookOpenText aria-hidden="true" className="size-4.5" />
        </span>
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold tracking-tight">{t('题目卡片')}</h1>
            <Badge tone="success">
              {totalCount} {t('道题')}
            </Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t('本地题库与模板关联')}</p>
        </div>
        <Button className="ml-auto" onClick={openCreateEditor} size="compact" type="button">
          <Plus aria-hidden="true" className="size-3.5" />
          {t('新建题目')}
        </Button>
      </header>

      {error && !editorOpen && !relationEditorOpen && (
        <div
          className="flex items-center gap-2 border-b border-red-500/20 bg-red-500/7 px-4 py-2 text-xs text-red-700 dark:text-red-300"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          <span>{t(error)}</span>
          <button
            aria-label={t('关闭题目错误提示')}
            className="ml-auto rounded p-1 hover:bg-red-500/10"
            onClick={onClearError}
            type="button"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        </div>
      )}

      <ResizableLayout
        className="min-h-0 flex-1"
        defaultPrimarySize={312}
        maximumPrimarySize={440}
        minimumPrimarySize={232}
        minimumSecondarySize={360}
        primaryLabel={t('题目列表面板')}
        secondaryLabel={t('题目详情面板')}
        separatorLabel={t('调整题目列表宽度')}
        storageKey={layoutPreferenceKeys.problemWorkspace}
        valueText={size => t('题目列表宽度 {size} 像素', { size })}
      >
        <section className="flex h-full min-h-0 flex-col bg-sidebar/75">
          <div className="border-b border-border px-3 py-3.5">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                {t('题目索引')}
              </span>
              <span className="rounded-md bg-panel px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground ring-1 ring-border">
                {filteredProblems.length} / {query ? matchedCount : totalCount}
              </span>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-panel px-3 shadow-xs transition-colors focus-within:border-success/35 focus-within:ring-2 focus-within:ring-success">
              <Search aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <input
                aria-label={t('筛选题目卡片')}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                onChange={event => setQuery(event.target.value)}
                placeholder={t('搜索标题、题号或标签')}
                value={query}
              />
            </div>
            <p className="mt-2.5 px-1 text-[10px] text-muted-foreground">
              {query ? `${filteredProblems.length} ${t('个匹配结果')}` : t('按最近修改排序')}
            </p>
          </div>

          {isLoading ? (
            <div className="grid flex-1 place-items-center">
              <LoaderCircle className="size-5 animate-spin text-primary" />
            </div>
          ) : filteredProblems.length === 0 ? (
            <div className="grid flex-1 place-items-center p-6 text-center">
              <div>
                <BookOpenText className="mx-auto size-7 text-muted-foreground" />
                <p className="mt-3 text-xs font-medium">
                  {t(query ? '没有匹配题目' : '还没有题目卡片')}
                </p>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                  {t(query ? '尝试缩短关键词。' : '手动创建第一道题，不需要配置 AI。')}
                </p>
                {!query && (
                  <Button className="mt-4" onClick={openCreateEditor} size="compact" type="button">
                    {t('创建第一道题')}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div
              aria-activedescendant={
                filteredProblems[focusedProblemIndex]
                  ? `problem-list-option-${filteredProblems[focusedProblemIndex].id}`
                  : undefined
              }
              aria-label={t('题目列表')}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2.5 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              onKeyDown={handleProblemListKeyDown}
              ref={listScrollRef}
              role="listbox"
              tabIndex={0}
            >
              {filteredProblems.length > 100 ? (
                <div
                  className="relative w-full"
                  style={{ height: problemListVirtualizer.getTotalSize() }}
                >
                  {problemListVirtualizer.getVirtualItems().map(virtualRow => {
                    const problem = filteredProblems[virtualRow.index]
                    if (!problem) return null
                    return (
                      <div
                        aria-selected={problem.id === selectedProblemId}
                        className="absolute left-0 top-0 h-[88px] w-full pb-1"
                        id={`problem-list-option-${problem.id}`}
                        key={problem.id}
                        role="option"
                        style={{ transform: `translateY(${virtualRow.start}px)` }}
                      >
                        {renderProblemButton(problem, virtualRow.index, true)}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredProblems.map((problem, index) => (
                    <div
                      aria-selected={problem.id === selectedProblemId}
                      id={`problem-list-option-${problem.id}`}
                      key={problem.id}
                      role="option"
                    >
                      {renderProblemButton(problem, index, false)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {hasMore && !isLoading && (
            <div className="border-t border-border p-2.5">
              <Button
                className="w-full"
                disabled={isLoadingMore}
                onClick={() => void onLoadMore()}
                size="compact"
                type="button"
                variant="outline"
              >
                {isLoadingMore && <LoaderCircle className="size-3.5 animate-spin" />}
                {t('加载更多题目')} · {problems.length} / {query ? matchedCount : totalCount}
              </Button>
            </div>
          )}
        </section>
        {!selectedProblem ? (
          <section className="relative grid min-h-0 place-items-center overflow-hidden bg-background p-8 text-center">
            <div
              aria-hidden="true"
              className="app-grid-texture pointer-events-none absolute inset-0 opacity-50"
            />
            <div className="relative max-w-sm rounded-3xl border border-border bg-panel/90 px-8 py-9 shadow-panel">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-success/11 text-success ring-1 ring-success/12">
                <BookOpenText aria-hidden="true" className="size-6" />
              </span>
              <h2 className="mt-4 text-sm font-semibold">{t('选择一道题目')}</h2>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {t('查看题面、备注、图片和关联模板；解除关联不会影响两侧数据。')}
              </p>
            </div>
          </section>
        ) : (
          <section
            aria-label={t('题目详情面板')}
            className="h-full min-h-0 overflow-y-auto overscroll-contain bg-background/75 outline-none [scrollbar-gutter:stable] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            role="region"
            tabIndex={0}
          >
            <header className="relative overflow-hidden border-b border-success/12 bg-panel px-6 py-5 shadow-xs">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-success" />
              <div
                aria-hidden="true"
                className="absolute -right-16 -top-20 size-56 rounded-full bg-success/8 blur-3xl"
              />
              <div className="flex flex-wrap items-start gap-4">
                <div className="relative min-w-0 flex-1">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-success">
                    {t('当前题目')}
                  </p>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 break-words text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                      {selectedProblem.title}
                    </h2>
                    <Badge tone={selectedProblem.status === 'solved' ? 'success' : 'accent'}>
                      {t(problemStatusLabels[selectedProblem.status])}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {[
                      selectedProblem.platform,
                      selectedProblem.problemCode,
                      selectedProblem.difficulty,
                    ]
                      .filter(Boolean)
                      .join(' · ') || t('尚未补充平台、题号和难度')}
                  </p>
                </div>
                <div className="relative flex flex-wrap items-center gap-2">
                  {confirmDeleteProblem ? (
                    <>
                      <span className="text-[11px] text-red-600 dark:text-red-300">
                        {t('将删除题目、图片与关联')}
                      </span>
                      <Button
                        disabled={isBusy}
                        onClick={() => {
                          void onDelete(selectedProblem.id).then(deleted => {
                            if (deleted) {
                              setConfirmDeleteProblem(false)
                              onSelect(null)
                            }
                          })
                        }}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        {t('确认删除')}
                      </Button>
                      <Button
                        onClick={() => setConfirmDeleteProblem(false)}
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        {t('取消')}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        onClick={openEditEditor}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        <Edit3 aria-hidden="true" className="size-3.5" />
                        {t('编辑')}
                      </Button>
                      <Button
                        aria-label={`${t('删除题目')} ${selectedProblem.title}`}
                        disabled={isBusy}
                        onClick={() => setConfirmDeleteProblem(true)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" className="size-4 text-red-500" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {selectedProblem.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {selectedProblem.tags.map(tag => (
                    <Badge key={tag}>{tag}</Badge>
                  ))}
                </div>
              )}
            </header>

            <div className="space-y-4 p-5 lg:p-6">
              <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
                <div className="flex items-center gap-2">
                  <FileText aria-hidden="true" className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">{t('题面与备注')}</h3>
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-3">
                  <div className="rounded-xl border border-border bg-surface-subtle/65 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('原始题面')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                      {selectedProblem.statement || t('尚未记录原始题面。')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('AI 题目摘要')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                      {selectedProblem.aiSummary || t('尚未生成 AI 题目摘要。')}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-surface-subtle/65 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t('本地备注')}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                      {selectedProblem.notes || t('尚未添加本地备注。')}
                    </p>
                  </div>
                </div>
                {Boolean(
                  selectedProblem.analysis.inputDescription ||
                  selectedProblem.analysis.outputDescription ||
                  selectedProblem.analysis.constraints.length ||
                  selectedProblem.analysis.algorithmSignals.length ||
                  selectedProblem.analysis.edgeCases.length ||
                  selectedProblem.analysis.examples.length,
                ) && (
                  <div className="mt-4 grid gap-3 rounded-xl border border-border bg-background/55 p-4 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('输入说明')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                        {selectedProblem.analysis.inputDescription || t('未提取')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t('输出说明')}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5">
                        {selectedProblem.analysis.outputDescription || t('未提取')}
                      </p>
                    </div>
                    {(
                      [
                        ['constraints', '数据约束'],
                        ['algorithmSignals', '算法信号'],
                        ['edgeCases', '边界情况'],
                      ] as const
                    ).map(([key, label]) => (
                      <div key={key}>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t(label)}
                        </p>
                        <p className="mt-1 text-xs leading-5">
                          {selectedProblem.analysis[key].join('、') || t('未提取')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedProblem.url && (
                  <p
                    className="mt-3 truncate text-[11px] text-muted-foreground"
                    title={selectedProblem.url}
                  >
                    {t('来源链接')}：{selectedProblem.url}
                  </p>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
                    <Link2 aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{t('关联模板')}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedProblem.relations.length} {t('个已确认关联')}
                    </p>
                  </div>
                  <Button
                    className="ml-auto"
                    disabled={templateTotalCount <= selectedProblem.relations.length || isBusy}
                    onClick={() => openRelationEditor(null)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    {t('添加关联')}
                  </Button>
                </div>

                {selectedProblem.relations.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/25 p-5 text-center text-xs text-muted-foreground">
                    {t('尚未关联模板。你可以从当前工作区选择一个或多个算法模板。')}
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    {selectedProblem.relations.map(relation => (
                      <article
                        className="interactive-lift flex items-center gap-3 rounded-xl border border-border bg-background/70 px-3 py-3 hover:border-success/25"
                        key={relation.templateId}
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                          {relation.available ? (
                            <Check aria-hidden="true" className="size-4 text-success" />
                          ) : (
                            <AlertTriangle aria-hidden="true" className="size-4 text-warning" />
                          )}
                        </span>
                        <button
                          className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          disabled={!relation.available}
                          onClick={() => onOpenTemplate(relation.templateId)}
                          type="button"
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium">
                              {relation.templateName}
                            </span>
                            <Badge>{t(relationTypeLabels[relation.relationType])}</Badge>
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                            {relation.available
                              ? relation.templatePath
                              : t('模板当前不可用，关联已保留')}
                          </span>
                          {relation.note && (
                            <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                              {relation.note}
                            </span>
                          )}
                        </button>
                        {confirmRemoveTemplateId === relation.templateId ? (
                          <div className="flex gap-1">
                            <Button
                              disabled={isBusy}
                              onClick={() => {
                                void onRemoveRelation({
                                  problemId: selectedProblem.id,
                                  templateId: relation.templateId,
                                }).then(result => {
                                  if (result) {
                                    setConfirmRemoveTemplateId(null)
                                  }
                                })
                              }}
                              size="compact"
                              type="button"
                              variant="outline"
                            >
                              {t('确认解除')}
                            </Button>
                            <Button
                              onClick={() => setConfirmRemoveTemplateId(null)}
                              size="compact"
                              type="button"
                              variant="ghost"
                            >
                              {t('取消')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              aria-label={`${t('编辑与模板的关联')} ${relation.templateName}`}
                              disabled={!relation.available}
                              onClick={() => openRelationEditor(relation)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Edit3 aria-hidden="true" className="size-3.5" />
                            </Button>
                            <Button
                              aria-label={`${t('解除与模板的关联')} ${relation.templateName}`}
                              onClick={() => setConfirmRemoveTemplateId(relation.templateId)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <Trash2 aria-hidden="true" className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-border bg-panel p-5 shadow-panel">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent-pink/10 text-accent-pink ring-1 ring-accent-pink/12">
                    <FileImage aria-hidden="true" className="size-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{t('题目图片')}</h3>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {selectedProblem.images.length} / 12 {t('张')} · {t('本地保存')}
                    </p>
                  </div>
                  <Button
                    className="ml-auto"
                    disabled={isBusy || selectedProblem.images.length >= 12}
                    onClick={() => void onAddImages(selectedProblem.id)}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <ImagePlus aria-hidden="true" className="size-3.5" />
                    {t('添加图片')}
                  </Button>
                </div>
                {selectedProblem.images.length === 0 ? (
                  <div className="mt-4 grid min-h-28 place-items-center rounded-xl border border-dashed border-border bg-muted/25 text-center">
                    <div>
                      <FileImage className="mx-auto size-5 text-muted-foreground" />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t('支持 PNG、JPEG、WebP，单张最大 8 MiB。')}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {selectedProblem.images.map(image => (
                      <ProblemImageCard
                        image={image}
                        isBusy={isBusy}
                        key={image.id}
                        onRemove={imageId =>
                          void onRemoveImage({ imageId, problemId: selectedProblem.id })
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </section>
        )}
      </ResizableLayout>

      <ProblemEditorDialog
        error={error}
        isBusy={isBusy}
        onOpenChange={open => {
          setEditorOpen(open)
          if (!open) {
            onClearError()
          }
        }}
        onSave={handleSaveProblem}
        open={editorOpen}
        problem={editingProblem}
        returnFocusTo={dialogReturnFocusRef.current}
      />
      {selectedProblem && (
        <RelationDialog
          error={error}
          existing={editingRelation}
          excludedTemplateIds={relatedTemplateIds}
          initialTemplates={templates}
          isBusy={isBusy}
          onOpenChange={open => {
            setRelationEditorOpen(open)
            if (!open) {
              onClearError()
              setEditingRelation(null)
            }
          }}
          onSearchTemplates={onSearchTemplates}
          onSave={handleSaveRelation}
          open={relationEditorOpen}
          problemId={selectedProblem.id}
          returnFocusTo={dialogReturnFocusRef.current}
        />
      )}
      {analysisOpen && (
        <Suspense fallback={null}>
          <ProblemAnalysisDialog
            onCreated={problem => {
              onAnalysisCreated(problem)
              onSelect(problem.id)
            }}
            onOpenChange={setAnalysisOpen}
            onSearchTemplates={onSearchTemplates}
            open={analysisOpen}
            returnFocusTo={dialogReturnFocusRef.current}
            templates={templates}
          />
        </Suspense>
      )}
    </main>
  )
}
