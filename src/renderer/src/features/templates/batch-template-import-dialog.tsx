import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertTriangle,
  CheckCircle2,
  FileCode2,
  FolderSearch,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { AiRequestPreview } from '@core/contracts/ai-request'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type {
  BatchImportTemplateResult,
  BatchTemplateImportConflict,
  BatchTemplateImportSource,
  TemplateClassification,
  TemplateMetadataLanguage,
} from '@core/contracts/template-management'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TaskProgressIndicator } from '@/components/task-progress-indicator'
import { runTrackedOperation } from '@/lib/background-task'
import { useI18n } from '@/lib/i18n'

import { emptyTemplateMetadata } from './template-metadata-merge'
import { formatTemplateSourceEncoding } from './template-source-encoding'

type BusyMode = 'choose' | 'classify' | 'import' | 'preview' | null
type ConflictChoice = 'overwrite' | 'rename' | 'skip'

const conflictMessages: Record<BatchTemplateImportConflict['kind'], string> = {
  'batch-duplicate': '本批次中有多个模板使用相同目标路径，请跳过或修改文件名。',
  'case-conflict': '目标路径与已有文件仅大小写不同，请跳过或修改文件名。',
  'existing-directory': '目标路径已被文件夹占用，请跳过或修改文件名。',
  'existing-file': '目标文件已经存在，请选择覆盖、不加入或修改文件名。',
  'existing-special': '目标路径不是可覆盖的普通文件，请跳过或修改文件名。',
}

export function BatchTemplateImportDialog({
  onComplete,
  onOpenChange,
  open,
}: {
  onComplete: (result: BatchImportTemplateResult) => void
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { locale, t } = useI18n()
  const [busyMode, setBusyMode] = useState<BusyMode>(null)
  const [taskStatus, setTaskStatus] = useState<BackgroundTaskStatus | null>(null)
  const cancelRequested = useRef(false)
  const activeClassificationRequestId = useRef<string | null>(null)
  const [classifications, setClassifications] = useState<Record<string, TemplateClassification>>({})
  const [conflictChoices, setConflictChoices] = useState<Record<string, ConflictChoice>>({})
  const [conflicts, setConflicts] = useState<BatchTemplateImportConflict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [outputLanguage, setOutputLanguage] = useState<TemplateMetadataLanguage>(locale)
  const [preview, setPreview] = useState<AiRequestPreview | null>(null)
  const [progress, setProgress] = useState({ completed: 0, total: 0 })
  const [sources, setSources] = useState<BatchTemplateImportSource[]>([])
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(new Set())
  const [targetPaths, setTargetPaths] = useState<Record<string, string>>({})

  const selectedSources = useMemo(
    () => sources.filter(source => selectedSourceIds.has(source.id)),
    [selectedSourceIds, sources],
  )
  const completedCount = selectedSources.filter(source => classifications[source.id]).length
  const importSources = selectedSources.filter(source => conflictChoices[source.id] !== 'skip')
  const unresolvedConflicts = conflicts.filter(conflict => {
    if (!selectedSourceIds.has(conflict.sourceId)) return false
    const choice = conflictChoices[conflict.sourceId]
    if (choice === 'skip') return false
    if (choice === 'overwrite' && conflict.canOverwrite) return false
    return !(choice === 'rename' && targetPaths[conflict.sourceId] !== conflict.relativePath)
  })
  const readyToImport =
    importSources.length > 0 &&
    unresolvedConflicts.length === 0 &&
    importSources.every(source => targetPaths[source.id]?.trim())
  const totalCharacters = useMemo(
    () => selectedSources.reduce((total, source) => total + source.content.length, 0),
    [selectedSources],
  )

  useEffect(() => {
    if (open) return
    cancelRequested.current = false
    setBusyMode(null)
    setTaskStatus(null)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setError(null)
    setOutputLanguage(locale)
    setPreview(null)
    setProgress({ completed: 0, total: 0 })
    setSources([])
    setSelectedSourceIds(new Set())
    setTargetPaths({})
  }, [locale, open])

  const replaceSources = (nextSources: BatchTemplateImportSource[]) => {
    if (nextSources.length === 0) return
    setSources(nextSources)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setSelectedSourceIds(new Set(nextSources.map(source => source.id)))
    setTargetPaths(Object.fromEntries(nextSources.map(source => [source.id, source.displayPath])))
    setProgress({ completed: 0, total: nextSources.length })
  }

  const chooseSources = async (kind: 'directory' | 'files') => {
    setBusyMode('choose')
    setError(null)
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: crypto.randomUUID(),
      kind: 'batch-operation',
      progress: {
        currentItem: kind === 'files' ? t('多个 C++ 文件') : t('C++ 文件夹'),
        phase: 'discovering',
        processedCount: 0,
        totalCount: null,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      replaceSources(
        kind === 'files'
          ? await window.desktop.templateManagement.chooseBatchImportFiles()
          : await window.desktop.templateManagement.chooseBatchImportDirectory(),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法读取批量 C++ 源码。'))
    } finally {
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const previewClassification = async () => {
    setBusyMode('preview')
    setError(null)
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: crypto.randomUUID(),
      kind: 'batch-operation',
      progress: {
        currentItem: null,
        phase: 'preparing',
        processedCount: 0,
        totalCount: selectedSources.length,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      setPreview(
        await window.desktop.templateManagement.previewBatchClassification({
          outputLanguage,
          sources: selectedSources,
        }),
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法准备批量 AI 发送预览。'))
    } finally {
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const classifyAll = async () => {
    setPreview(null)
    setBusyMode('classify')
    setError(null)
    setClassifications({})
    setConflictChoices({})
    setConflicts([])
    setProgress({ completed: 0, total: selectedSources.length })
    cancelRequested.current = false
    const taskId = crypto.randomUUID()
    const startedAt = new Date().toISOString()
    setTaskStatus({
      error: null,
      finishedAt: null,
      id: taskId,
      kind: 'batch-operation',
      progress: {
        currentItem: selectedSources[0]?.displayPath ?? null,
        phase: 'requesting-ai',
        processedCount: 0,
        totalCount: selectedSources.length,
      },
      result: null,
      startedAt,
      state: 'running',
    })
    try {
      for (let index = 0; index < selectedSources.length; index += 1) {
        if (cancelRequested.current) {
          setError(t('批量 AI 补全已停止；尚未向工作区写入文件。'))
          return
        }
        const source = selectedSources[index]!
        setTaskStatus(current =>
          current
            ? {
                ...current,
                progress: {
                  currentItem: source.displayPath,
                  phase: 'requesting-ai',
                  processedCount: index,
                  totalCount: selectedSources.length,
                },
              }
            : current,
        )
        const requestId = crypto.randomUUID()
        activeClassificationRequestId.current = requestId
        const result = await window.desktop.templateManagement.classify({
          content: source.content,
          fileName: source.fileName,
          metadata: emptyTemplateMetadata,
          outputLanguage,
          requestId,
        })
        if (cancelRequested.current || activeClassificationRequestId.current !== requestId) {
          setError(t('批量 AI 补全已停止；尚未向工作区写入文件。'))
          return
        }
        activeClassificationRequestId.current = null
        setClassifications(current => ({ ...current, [source.id]: result }))
        setTargetPaths(current => ({ ...current, [source.id]: result.suggestedRelativePath }))
        setProgress({ completed: index + 1, total: selectedSources.length })
        setTaskStatus(current =>
          current
            ? {
                ...current,
                progress: {
                  currentItem: source.displayPath,
                  phase: 'processing',
                  processedCount: index + 1,
                  totalCount: selectedSources.length,
                },
              }
            : current,
        )
      }
    } catch (caught) {
      setError(
        cancelRequested.current
          ? t('批量 AI 补全已停止；尚未向工作区写入文件。')
          : caught instanceof Error
            ? caught.message
            : t('批量 AI 元数据补全未完成；尚未向工作区写入文件。'),
      )
    } finally {
      activeClassificationRequestId.current = null
      setBusyMode(null)
      setTaskStatus(null)
    }
  }

  const importAll = async () => {
    if (!readyToImport) return
    setBusyMode('import')
    setError(null)
    setTaskStatus(null)
    try {
      const candidates = selectedSources.filter(source => conflictChoices[source.id] !== 'skip')
      const inspection = await window.desktop.templateManagement.inspectBatchImport({
        items: candidates.map(source => ({
          relativePath: targetPaths[source.id]!,
          sourceId: source.id,
        })),
      })
      const previousConflicts = conflicts
      setConflicts(inspection.conflicts)
      const inspectedBySource = new Map(
        inspection.conflicts.map(conflict => [conflict.sourceId, conflict]),
      )
      const staleOverwriteIds = candidates
        .filter(source => {
          if (conflictChoices[source.id] !== 'overwrite') return false
          const currentConflict = inspectedBySource.get(source.id)
          const previousConflict = previousConflicts.find(
            conflict => conflict.sourceId === source.id,
          )
          return (
            !currentConflict?.canOverwrite ||
            !previousConflict?.canOverwrite ||
            currentConflict.existingFileState !== previousConflict.existingFileState
          )
        })
        .map(source => source.id)
      if (staleOverwriteIds.length > 0) {
        setConflictChoices(current => {
          const next = { ...current }
          for (const sourceId of staleOverwriteIds) delete next[sourceId]
          return next
        })
        setError(t('待覆盖文件状态已变化，请重新选择处理方式。'))
        return
      }
      const unresolved = inspection.conflicts.filter(conflict => {
        const choice = conflictChoices[conflict.sourceId]
        return !(choice === 'overwrite' && conflict.canOverwrite)
      })
      if (unresolved.length > 0) {
        setError(t('检测到 {count} 项路径冲突，请逐项选择处理方式。', { count: unresolved.length }))
        return
      }
      const requestId = crypto.randomUUID()
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.importTemplatesBatch({
            items: candidates.map(source => ({
              content: source.content,
              conflictAction: conflictChoices[source.id] === 'overwrite' ? 'overwrite' : 'create',
              expectedExistingFileState:
                conflictChoices[source.id] === 'overwrite'
                  ? (inspectedBySource.get(source.id)?.existingFileState ?? null)
                  : null,
              metadata: classifications[source.id]?.metadata ?? null,
              relativePath: targetPaths[source.id]!,
              sourceId: source.id,
            })),
            requestId,
          }),
        setTaskStatus,
      )
      onComplete(result)
      onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('批量导入未完成，请检查目标路径。'))
    } finally {
      setBusyMode(null)
    }
  }

  return (
    <Dialog.Root
      onOpenChange={nextOpen => {
        if (!nextOpen && busyMode !== 'import') onOpenChange(false)
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-overlay/70 backdrop-blur-[4px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-[61] flex h-[min(820px,calc(100vh-32px))] w-[min(1040px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <FileCode2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {t('批量导入 C++ 模板')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('默认全选，可直接导入或按需生成 AI 元数据；确认前不会写入当前工作区。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭批量导入')}
              className="relative z-10 ml-auto"
              disabled={busyMode === 'import'}
              onClick={() => onOpenChange(false)}
              size="close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="pointer-events-none size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && (
              <div
                className="mb-4 rounded-xl border border-red-500/25 bg-red-500/7 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                {t(error)}
              </div>
            )}

            {taskStatus && ['queued', 'running', 'cancelling'].includes(taskStatus.state) && (
              <div className="mb-4">
                <TaskProgressIndicator status={taskStatus} title="批量任务" />
              </div>
            )}

            <section className="rounded-2xl border border-border bg-background/55 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={Boolean(busyMode)}
                  onClick={() => void chooseSources('files')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {busyMode === 'choose' ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Upload className="size-3.5" />
                  )}
                  {t('选择多个 C++ 文件')}
                </Button>
                <Button
                  disabled={Boolean(busyMode)}
                  onClick={() => void chooseSources('directory')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  <FolderSearch className="size-3.5" />
                  {t('扫描 C++ 文件夹')}
                </Button>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {sources.length > 0
                    ? t('已选 {selected}/{total} 份 · {characters} 字符', {
                        characters: totalCharacters,
                        selected: selectedSources.length,
                        total: sources.length,
                      })
                    : t('单批最多 100 份，仅接受 .cpp')}
                </span>
              </div>
            </section>

            {sources.length === 0 ? (
              <div className="mt-4 grid min-h-72 place-items-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center">
                <div>
                  <FolderSearch className="mx-auto size-8 text-muted-foreground" />
                  <p className="mt-3 text-sm font-medium">{t('选择待复制的 C++ 源码')}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('原文件只读；最终会在当前模板工作区创建新的 .cpp 文件。')}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Button
                    disabled={Boolean(busyMode) || selectedSources.length === sources.length}
                    onClick={() => {
                      setSelectedSourceIds(new Set(sources.map(source => source.id)))
                      setConflicts([])
                    }}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('全选')}
                  </Button>
                  <Button
                    disabled={Boolean(busyMode) || selectedSources.length === 0}
                    onClick={() => {
                      setSelectedSourceIds(new Set())
                      setConflicts([])
                    }}
                    size="compact"
                    type="button"
                    variant="ghost"
                  >
                    {t('取消全选')}
                  </Button>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {t('默认全选；取消勾选的源码不会发送给 AI，也不会加入工作区。')}
                  </span>
                </div>
                {sources.map(source => {
                  const classification = classifications[source.id]
                  const conflict = conflicts.find(item => item.sourceId === source.id)
                  const selected = selectedSourceIds.has(source.id)
                  return (
                    <article
                      className={`rounded-xl border p-3 transition-colors ${
                        selected
                          ? 'border-border bg-background/60'
                          : 'border-border/60 bg-muted/25 opacity-65'
                      }`}
                      key={source.id}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          aria-label={`${t('选择导入')} ${source.displayPath}`}
                          checked={selected}
                          className="size-4 rounded border-border accent-primary"
                          disabled={Boolean(busyMode)}
                          onChange={event => {
                            setSelectedSourceIds(current => {
                              const next = new Set(current)
                              if (event.target.checked) next.add(source.id)
                              else next.delete(source.id)
                              return next
                            })
                            setConflicts([])
                            setError(null)
                          }}
                          type="checkbox"
                        />
                        {classification ? (
                          <CheckCircle2 className="size-4 shrink-0 text-success" />
                        ) : busyMode === 'classify' &&
                          progress.completed ===
                            selectedSources.findIndex(item => item.id === source.id) ? (
                          <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                          {source.displayPath}
                        </span>
                        <Badge>{formatTemplateSourceEncoding(source.sourceEncoding)}</Badge>
                        {classification && (
                          <Badge tone="accent">
                            {Math.round(classification.confidence * 100)}%
                          </Badge>
                        )}
                      </div>
                      {selected && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                          <p className="text-[10px] text-muted-foreground sm:col-span-2">
                            {t('已按源编码读取；工作区新副本统一保存为 UTF-8。')}
                          </p>
                          <label className="text-[10px] font-medium text-muted-foreground">
                            {t('工作区保存路径')}
                            <input
                              aria-label={`${t('工作区保存路径')} ${source.displayPath}`}
                              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                              disabled={Boolean(busyMode)}
                              onChange={event => {
                                setTargetPaths(current => ({
                                  ...current,
                                  [source.id]: event.target.value,
                                }))
                                if (conflict) {
                                  setConflictChoices(current => ({
                                    ...current,
                                    [source.id]: 'rename',
                                  }))
                                }
                                setConflicts([])
                                setError(null)
                              }}
                              value={targetPaths[source.id] ?? ''}
                            />
                          </label>
                          {classification ? (
                            <>
                              <div className="self-end text-right text-[10px] text-muted-foreground">
                                <p>{classification.categoryPath.join(' / ')}</p>
                                <p className="mt-1">
                                  {classification.providerName} · {classification.model}
                                </p>
                              </div>
                              <p className="text-[10px] leading-4 text-muted-foreground sm:col-span-2">
                                {classification.metadata.tags.join('、') || t('无标签')} ·{' '}
                                {classification.classificationReason}
                              </p>
                            </>
                          ) : (
                            <p className="self-end text-right text-[10px] text-muted-foreground">
                              {t('未生成 AI 元数据，将按空元数据导入')}
                            </p>
                          )}
                          {conflict && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 sm:col-span-2">
                              <div className="flex gap-2 text-xs text-amber-800 dark:text-amber-200">
                                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                                <div>
                                  <p className="font-semibold">{t('目标路径冲突')}</p>
                                  <p className="mt-1 text-[11px] leading-4">
                                    {t(conflictMessages[conflict.kind])}
                                  </p>
                                  {conflict.actualRelativePath &&
                                    conflict.actualRelativePath !== conflict.relativePath && (
                                      <p className="mt-1 font-mono text-[10px]">
                                        {t('已有路径')}：{conflict.actualRelativePath}
                                      </p>
                                    )}
                                </div>
                              </div>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  aria-pressed={conflictChoices[source.id] === 'skip'}
                                  onClick={() =>
                                    setConflictChoices(current => ({
                                      ...current,
                                      [source.id]: 'skip',
                                    }))
                                  }
                                  size="compact"
                                  type="button"
                                  variant="outline"
                                >
                                  {t('不加入')}
                                </Button>
                                <Button
                                  aria-pressed={conflictChoices[source.id] === 'rename'}
                                  onClick={() =>
                                    setConflictChoices(current => ({
                                      ...current,
                                      [source.id]: 'rename',
                                    }))
                                  }
                                  size="compact"
                                  type="button"
                                  variant="outline"
                                >
                                  {t('修改文件名')}
                                </Button>
                                {conflict.canOverwrite && (
                                  <Button
                                    aria-pressed={conflictChoices[source.id] === 'overwrite'}
                                    onClick={() =>
                                      setConflictChoices(current => ({
                                        ...current,
                                        [source.id]: 'overwrite',
                                      }))
                                    }
                                    size="compact"
                                    type="button"
                                    variant="outline"
                                  >
                                    {t('覆盖已有文件')}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  )
                })}
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border px-5 py-4">
            <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
              {t('补全语言')}
              <select
                aria-label={t('批量补全语言')}
                className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                disabled={Boolean(busyMode)}
                onChange={event => {
                  setOutputLanguage(event.target.value as TemplateMetadataLanguage)
                  setClassifications({})
                  setConflictChoices({})
                  setConflicts([])
                  setTargetPaths(
                    Object.fromEntries(sources.map(source => [source.id, source.displayPath])),
                  )
                }}
                value={outputLanguage}
              >
                <option value="zh-CN">{t('中文')}</option>
                <option value="en">English</option>
              </select>
            </label>
            {busyMode === 'classify' && (
              <span className="text-xs text-muted-foreground">
                {t('正在补全 {completed}/{total}', progress)}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {busyMode === 'classify' ? (
                <Button
                  onClick={() => {
                    cancelRequested.current = true
                    const requestId = activeClassificationRequestId.current
                    if (requestId) {
                      void window.desktop.templateManagement.cancelClassification(requestId)
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  {t('取消当前及后续补全')}
                </Button>
              ) : (
                <Button
                  disabled={Boolean(busyMode)}
                  onClick={() => onOpenChange(false)}
                  type="button"
                  variant="outline"
                >
                  {t('取消')}
                </Button>
              )}
              <Button
                disabled={Boolean(busyMode) || selectedSources.length === 0}
                onClick={() => void previewClassification()}
                type="button"
                variant="outline"
              >
                {busyMode === 'preview' ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {completedCount > 0 ? t('重新生成所选元数据') : t('AI 补全所选模板')}
              </Button>
              <Button
                disabled={Boolean(busyMode) || !readyToImport}
                onClick={() => void importAll()}
                type="button"
              >
                {busyMode === 'import' && <LoaderCircle className="size-4 animate-spin" />}
                {t('确认导入 {count} 份', { count: importSources.length })}
              </Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>

      {preview && (
        <AiRequestPreviewDialog
          busy={false}
          onCancel={() => setPreview(null)}
          onConfirm={() => void classifyAll()}
          preview={preview}
        />
      )}
    </Dialog.Root>
  )
}
