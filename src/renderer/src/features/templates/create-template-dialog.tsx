import * as Dialog from '@radix-ui/react-dialog'
import {
  AlertCircle,
  Check,
  FilePlus2,
  GitCompareArrows,
  LoaderCircle,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type {
  BatchImportTemplateResult,
  ImportTemplateRequest,
  TemplateClassification,
  TemplateMetadataLanguage,
  TemplateMetadataFields,
} from '@core/contracts/template-management'
import type { AiRequestPreview } from '@core/contracts/ai-request'
import type { TemplateSourceEncoding } from '@core/contracts/workspace'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { activeElementOrNull, restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

import { BatchTemplateImportDialog } from './batch-template-import-dialog'
import {
  emptyTemplateMetadata,
  findTemplateMetadataConflicts,
  hasTemplateMetadata,
  mergeTemplateClassification,
  restoreDraftBeforeClassificationLanguageChange,
  type TemplateDraftSnapshot,
  type TemplateMergeChoice,
  type TemplateMergeKey,
  type TemplateMetadataConflict,
} from './template-metadata-merge'
import { formatTemplateSourceEncoding } from './template-source-encoding'

interface CreateTemplateDialogProps {
  error: string | null
  isBusy: boolean
  onBatchComplete: (result: BatchImportTemplateResult) => void
  onCreate: (request: ImportTemplateRequest) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusTo?: HTMLElement | null
}

function MetadataConflictDialog({
  choices,
  conflicts,
  onApply,
  onCancel,
  onChoice,
}: {
  choices: Partial<Record<TemplateMergeKey, TemplateMergeChoice>>
  conflicts: TemplateMetadataConflict[]
  onApply: () => void
  onCancel: () => void
  onChoice: (key: TemplateMergeKey, choice: TemplateMergeChoice) => void
}) {
  const { t } = useI18n()
  const chooseAll = (choice: TemplateMergeChoice) => {
    for (const conflict of conflicts) onChoice(conflict.key, choice)
  }

  return (
    <Dialog.Root onOpenChange={nextOpen => !nextOpen && onCancel()} open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-overlay/70 backdrop-blur-[3px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-[71] flex h-[min(720px,calc(100vh-32px))] w-[min(880px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-warning/20 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-warning/12 text-warning">
              <GitCompareArrows className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">{t('确认元数据冲突')}</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-muted-foreground">
                {t('AI 建议与已填写内容不同。默认保留你的内容，请逐项确认后再合并。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭元数据冲突确认')}
              className="ml-auto"
              onClick={onCancel}
              size="close"
              type="button"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/35 p-3">
              <p className="text-xs text-muted-foreground">
                {t('共 {count} 个冲突字段', { count: conflicts.length })}
              </p>
              <div className="flex gap-2">
                <Button
                  onClick={() => chooseAll('user')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {t('全部保留我的')}
                </Button>
                <Button
                  onClick={() => chooseAll('ai')}
                  size="compact"
                  type="button"
                  variant="outline"
                >
                  {t('全部使用 AI')}
                </Button>
              </div>
            </div>

            <div className="space-y-3">
              {conflicts.map(conflict => (
                <section
                  className="rounded-xl border border-border bg-background p-4"
                  key={conflict.key}
                >
                  <h3 className="text-xs font-semibold">{t(conflict.label)}</h3>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {(
                      [
                        ['user', t('我的内容'), conflict.userValue],
                        ['ai', t('AI 建议'), conflict.aiValue],
                      ] as const
                    ).map(([choice, label, value]) => {
                      const selected = choices[conflict.key] === choice
                      return (
                        <button
                          aria-label={`${t(conflict.label)} ${t(choice === 'ai' ? '使用 AI 建议' : '保留我的内容')}`}
                          aria-pressed={selected}
                          className={cn(
                            'rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'border-primary/40 bg-primary/8'
                              : 'border-border hover:bg-muted/40',
                          )}
                          key={choice}
                          onClick={() => onChoice(conflict.key, choice)}
                          type="button"
                        >
                          <span className="flex items-center gap-2 text-[11px] font-semibold">
                            <span
                              className={cn(
                                'grid size-4 place-items-center rounded-full border',
                                selected
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-border',
                              )}
                            >
                              {selected && <Check className="size-3" />}
                            </span>
                            {label}
                          </span>
                          <span className="mt-2 block whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
                            {value}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>

          <footer className="flex items-center justify-end gap-2 border-t border-border px-5 py-4">
            <Button onClick={onCancel} type="button" variant="outline">
              {t('暂不合并')}
            </Button>
            <Button onClick={onApply} type="button">
              {t('确认并应用选择')}
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function CreateTemplateDialog({
  error,
  isBusy,
  onBatchComplete,
  onCreate,
  onOpenChange,
  open,
  returnFocusTo,
}: CreateTemplateDialogProps) {
  const { locale, t } = useI18n()
  const [batchOpen, setBatchOpen] = useState(false)
  const [classification, setClassification] = useState<TemplateClassification | null>(null)
  const [classificationElapsedSeconds, setClassificationElapsedSeconds] = useState(0)
  const [classificationStartedAt, setClassificationStartedAt] = useState<number | null>(null)
  const [classificationBaseline, setClassificationBaseline] =
    useState<TemplateDraftSnapshot | null>(null)
  const [conflictChoices, setConflictChoices] = useState<
    Partial<Record<TemplateMergeKey, TemplateMergeChoice>>
  >({})
  const [conflicts, setConflicts] = useState<TemplateMetadataConflict[]>([])
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')
  const [localBusy, setLocalBusy] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [importedSourceEncoding, setImportedSourceEncoding] =
    useState<TemplateSourceEncoding | null>(null)
  const [metadata, setMetadata] = useState<TemplateMetadataFields>(emptyTemplateMetadata)
  const [metadataLanguage, setMetadataLanguage] = useState<TemplateMetadataLanguage>(locale)
  const [requestPreview, setRequestPreview] = useState<AiRequestPreview | null>(null)
  const previewReturnFocusRef = useRef<HTMLElement | null>(null)
  const [pendingClassification, setPendingClassification] = useState<TemplateClassification | null>(
    null,
  )
  const [tagsText, setTagsText] = useState('')
  const activeClassificationRequestId = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      setClassification(null)
      setClassificationElapsedSeconds(0)
      setClassificationStartedAt(null)
      setClassificationBaseline(null)
      setConflictChoices({})
      setConflicts([])
      setContent('')
      setFileName('')
      setLocalError(null)
      setImportedSourceEncoding(null)
      setMetadata(emptyTemplateMetadata)
      setMetadataLanguage(locale)
      setPendingClassification(null)
      setRequestPreview(null)
      setTagsText('')
    }
  }, [locale, open])

  useEffect(() => {
    if (classificationStartedAt === null) return
    const update = () =>
      setClassificationElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - classificationStartedAt) / 1_000)),
      )
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [classificationStartedAt])

  const updateMetadata = <Key extends keyof TemplateMetadataFields>(
    key: Key,
    value: TemplateMetadataFields[Key],
  ) => setMetadata(current => ({ ...current, [key]: value }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      await onCreate({
        content,
        metadata: hasTemplateMetadata(metadata) ? metadata : null,
        relativePath: fileName,
      })
    ) {
      onOpenChange(false)
    }
  }

  const chooseSource = async () => {
    setLocalBusy(true)
    setLocalError(null)
    try {
      const source = await window.desktop.templateManagement.chooseImportSource()
      if (source) {
        setContent(source.content)
        setFileName(source.fileName)
        setImportedSourceEncoding(source.sourceEncoding)
        setClassification(null)
        setClassificationBaseline(null)
      }
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : t('无法读取源码文件。'))
    } finally {
      setLocalBusy(false)
    }
  }

  const applyClassification = (
    result: TemplateClassification,
    choices: Partial<Record<TemplateMergeKey, TemplateMergeChoice>>,
  ) => {
    setClassificationBaseline(current => current ?? { metadata, relativePath: fileName })
    const merged = mergeTemplateClassification(fileName, metadata, result, choices)
    setFileName(merged.relativePath)
    setMetadata(merged.metadata)
    setTagsText(merged.metadata.tags.join(', '))
    setClassification(result)
    setPendingClassification(null)
    setConflicts([])
    setConflictChoices({})
  }

  const changeMetadataLanguage = (nextLanguage: TemplateMetadataLanguage) => {
    if (nextLanguage === metadataLanguage) return
    if (classification && classificationBaseline) {
      const restored = restoreDraftBeforeClassificationLanguageChange(
        { metadata, relativePath: fileName },
        classificationBaseline,
        classification,
      )
      setFileName(restored.relativePath)
      setMetadata(restored.metadata)
      setTagsText(restored.metadata.tags.join(', '))
    }
    setClassification(null)
    setClassificationBaseline(null)
    setPendingClassification(null)
    setConflicts([])
    setConflictChoices({})
    setRequestPreview(null)
    setLocalError(null)
    setMetadataLanguage(nextLanguage)
  }

  const executeClassification = async () => {
    const requestId = crypto.randomUUID()
    activeClassificationRequestId.current = requestId
    setLocalBusy(true)
    setLocalError(null)
    setClassificationElapsedSeconds(0)
    setClassificationStartedAt(Date.now())
    try {
      const result = await window.desktop.templateManagement.classify({
        content,
        fileName,
        metadata,
        outputLanguage: metadataLanguage,
        requestId,
      })
      if (activeClassificationRequestId.current !== requestId) return
      setRequestPreview(null)
      const nextConflicts = findTemplateMetadataConflicts(fileName, metadata, result)
      if (nextConflicts.length === 0) {
        applyClassification(result, {})
        return
      }
      setPendingClassification(result)
      setConflicts(nextConflicts)
      setConflictChoices(
        Object.fromEntries(nextConflicts.map(conflict => [conflict.key, 'user'])) as Partial<
          Record<TemplateMergeKey, TemplateMergeChoice>
        >,
      )
    } catch (caught) {
      if (activeClassificationRequestId.current !== requestId) return
      setRequestPreview(null)
      setLocalError(caught instanceof Error ? caught.message : t('AI 元数据补全未完成。'))
    } finally {
      if (activeClassificationRequestId.current === requestId) {
        activeClassificationRequestId.current = null
        setClassificationStartedAt(null)
        setLocalBusy(false)
      }
    }
  }

  const cancelClassification = () => {
    const requestId = activeClassificationRequestId.current
    if (!requestId) return
    activeClassificationRequestId.current = null
    setRequestPreview(null)
    setClassificationStartedAt(null)
    setLocalBusy(false)
    setLocalError(t('AI 请求已取消，迟到响应不会写入状态。'))
    void window.desktop.templateManagement.cancelClassification(requestId)
  }

  const closeDialog = () => {
    if (activeClassificationRequestId.current) {
      cancelClassification()
    } else {
      setRequestPreview(null)
      setClassificationStartedAt(null)
      setLocalBusy(false)
    }
    onOpenChange(false)
  }

  const previewClassification = async () => {
    previewReturnFocusRef.current = activeElementOrNull()
    setLocalBusy(true)
    setLocalError(null)
    try {
      setRequestPreview(
        await window.desktop.templateManagement.previewClassification({
          content,
          fileName,
          metadata,
          outputLanguage: metadataLanguage,
        }),
      )
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : t('AI 元数据补全未完成。'))
    } finally {
      setLocalBusy(false)
    }
  }

  const inputClass =
    'mt-1.5 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-ring'

  return (
    <>
      <Dialog.Root
        onOpenChange={nextOpen => {
          if (!nextOpen) closeDialog()
          else onOpenChange(true)
        }}
        open={open}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[3px]" />
          <Dialog.Content
            className="dialog-surface fixed left-1/2 top-1/2 z-50 flex h-[min(820px,calc(100vh-32px))] w-[min(1120px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
            onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
          >
            <header className="flex items-start border-b border-border px-5 py-4">
              <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <FilePlus2 aria-hidden="true" className="size-4" />
              </span>
              <div>
                <Dialog.Title className="text-sm font-semibold">{t('新建算法模板')}</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  {t('粘贴源码即可请求 AI；所有元数据都能在写入前编辑和确认。')}
                </Dialog.Description>
              </div>
              <Button
                aria-label={t('关闭新建模板')}
                className="ml-auto"
                onClick={closeDialog}
                size="close"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </header>

            <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
              {(error || localError) && (
                <div
                  className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                  role="alert"
                >
                  <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>{localError ?? error}</span>
                </div>
              )}

              <div className="grid min-h-0 flex-1 gap-4 p-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
                <section className="flex min-h-0 flex-col rounded-2xl border border-border bg-background/55 p-4 shadow-xs">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-xs font-semibold">{t('源码与保存路径')}</h2>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {t('路径可以暂时留空，AI 会根据源码建议文件名与分类。')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={isBusy || localBusy}
                        onClick={() => {
                          onOpenChange(false)
                          setBatchOpen(true)
                        }}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        <FilePlus2 className="size-3.5" />
                        {t('批量导入 C++')}
                      </Button>
                      <Button
                        disabled={isBusy || localBusy}
                        onClick={() => void chooseSource()}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        <Upload className="size-3.5" />
                        {t('导入源码文件')}
                      </Button>
                    </div>
                  </div>

                  <label className="mt-4 text-xs font-semibold" htmlFor="template-file-name">
                    {t('文件名 / 保存路径')}
                  </label>
                  <input
                    autoFocus
                    className={`${inputClass} h-10`}
                    id="template-file-name"
                    maxLength={160}
                    onChange={event => setFileName(event.target.value)}
                    placeholder={t('可暂空，例如 图论/最短路/dijkstra.cpp')}
                    value={fileName}
                  />

                  <label className="mt-4 text-xs font-semibold" htmlFor="template-source">
                    {t('模板源码')}
                  </label>
                  {importedSourceEncoding && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                      <Badge>{formatTemplateSourceEncoding(importedSourceEncoding)}</Badge>
                      <span>{t('已按源编码读取；工作区新副本统一保存为 UTF-8。')}</span>
                    </div>
                  )}
                  <textarea
                    className="mt-2 min-h-40 flex-1 resize-none rounded-xl border border-border bg-code px-4 py-3 font-mono text-xs leading-5 text-code-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                    id="template-source"
                    onChange={event => {
                      setContent(event.target.value)
                      setImportedSourceEncoding(null)
                      setClassification(null)
                    }}
                    placeholder={t('粘贴或输入模板源码…')}
                    spellCheck={false}
                    value={content}
                  />

                  <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-xs font-semibold text-primary">
                          <Sparkles className="size-3.5" />
                          {t('AI 补全路径与元数据')}
                        </p>
                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                          {t('只要已有源码即可使用；冲突内容不会被静默覆盖。')}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-end gap-2">
                        <label className="grid gap-1 text-[10px] font-medium text-muted-foreground">
                          {t('补全语言')}
                          <select
                            aria-label={t('补全语言')}
                            className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                            disabled={isBusy || localBusy}
                            onChange={event =>
                              changeMetadataLanguage(event.target.value as TemplateMetadataLanguage)
                            }
                            value={metadataLanguage}
                          >
                            <option value="zh-CN">{t('中文')}</option>
                            <option value="en">English</option>
                          </select>
                        </label>
                        <Button
                          disabled={isBusy || localBusy || !content.trim()}
                          onClick={() => void previewClassification()}
                          size="compact"
                          type="button"
                        >
                          {localBusy ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                          {t('立即补全')}
                        </Button>
                      </div>
                    </div>
                    {classification && (
                      <div className="mt-2 rounded-lg border border-primary/12 bg-primary/5 px-2.5 py-2 text-[10px] text-muted-foreground">
                        <p>
                          {t('已合并 {provider} · {model} 的建议，可继续编辑。', {
                            model: classification.model,
                            provider: classification.providerName,
                          })}
                        </p>
                        <p className="mt-1 font-medium text-foreground">
                          {t('精细分类')}：{classification.categoryPath.join(' / ')}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {classification.placement.mode === 'existing-directory'
                            ? t('使用现有目录')
                            : t('将新建分类目录')}
                          ：{classification.placement.targetDirectory} ·{' '}
                          {Math.round(classification.confidence * 100)}%
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                          {classification.classificationReason}
                        </p>
                        {classification.diagnostic && (
                          <div className="mt-2 rounded-lg border border-border bg-background/55 px-2.5 py-2 text-[10px] leading-4 text-muted-foreground">
                            <p className="font-medium text-foreground">
                              {t(
                                '{calls} 次 Provider 请求 · 总耗时 {seconds} 秒 · 输出预算 {budgets}',
                                {
                                  budgets: classification.diagnostic.outputTokenBudgets.join(' → '),
                                  calls: classification.diagnostic.providerCallCount,
                                  seconds: (
                                    classification.diagnostic.totalElapsedMs / 1_000
                                  ).toFixed(1),
                                },
                              )}
                            </p>
                            <p className="mt-1">
                              {classification.diagnostic.stageTimings
                                .map(stage =>
                                  t('{stage} {seconds} 秒（{count} 次请求）', {
                                    count: stage.requestCount,
                                    seconds: (stage.elapsedMs / 1_000).toFixed(1),
                                    stage: t(
                                      stage.stage === 'initial-generation'
                                        ? '首次生成'
                                        : stage.stage === 'schema-fallback'
                                          ? 'Schema 降级'
                                          : stage.stage === 'structure-repair'
                                            ? '结构修复'
                                            : '语义重试',
                                    ),
                                  }),
                                )
                                .join(' · ')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                      {t(
                        '语言选择会约束分类目录、文件名、标签与说明字段；源码语言、扩展名和复杂度表达保持不变。',
                      )}
                    </p>
                  </div>
                </section>

                <section className="min-h-0 overflow-y-auto rounded-2xl border border-border bg-surface-subtle/45 p-4 shadow-xs">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-xs font-semibold">{t('算法元数据')}</h2>
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        {t('可手动填写，也可让 AI 补全空白字段。')}
                      </p>
                    </div>
                    <span className="rounded-full border border-border bg-panel px-2 py-1 text-[10px] text-muted-foreground">
                      {t('创建前草稿')}
                    </span>
                  </div>

                  <label className="mt-4 block text-xs font-semibold">
                    {t('标签')}
                    <input
                      aria-label={t('模板标签')}
                      className={`${inputClass} h-9`}
                      onChange={event => {
                        setTagsText(event.target.value)
                        updateMetadata(
                          'tags',
                          event.target.value
                            .split(/[,，]/)
                            .map(tag => tag.trim())
                            .filter(Boolean),
                        )
                      }}
                      placeholder={t('图论, 最短路, Dijkstra')}
                      value={tagsText}
                    />
                  </label>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {(
                      [
                        ['timeComplexity', '时间复杂度', 'O((n + m) log n)'],
                        ['spaceComplexity', '空间复杂度', 'O(n + m)'],
                      ] as const
                    ).map(([key, label, placeholder]) => (
                      <label className="text-xs font-semibold" key={key}>
                        {t(label)}
                        <input
                          aria-label={t(label)}
                          className={`${inputClass} h-9`}
                          onChange={event => updateMetadata(key, event.target.value.trim() || null)}
                          placeholder={t(placeholder)}
                          value={metadata[key] ?? ''}
                        />
                      </label>
                    ))}
                  </div>

                  {(
                    [
                      ['solves', '解决的问题', '描述这份模板解决的核心问题…'],
                      ['constraints', '适用约束', '适用的数据范围、边权或输入条件…'],
                      ['prerequisites', '前置条件', '需要掌握的数据结构或算法概念…'],
                      ['commonMistakes', '常见错误', '容易写错或遗漏的边界条件…'],
                      ['notes', '模板用户笔记', '仅保存在本机的个人备注…'],
                    ] as const
                  ).map(([key, label, placeholder]) => (
                    <label className="mt-3 block text-xs font-semibold" key={key}>
                      {t(label)}
                      <textarea
                        aria-label={t(label)}
                        className={`${inputClass} min-h-20 resize-y py-2.5 leading-5`}
                        onChange={event => updateMetadata(key, event.target.value)}
                        placeholder={t(placeholder)}
                        value={metadata[key]}
                      />
                    </label>
                  ))}
                </section>
              </div>

              <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-border px-5 py-4">
                <p className="text-[11px] text-muted-foreground">
                  {t('创建前不会写入文件；同名文件永远不会被覆盖。')}
                </p>
                <div className="flex gap-2">
                  <Button onClick={closeDialog} type="button" variant="outline">
                    {t('取消')}
                  </Button>
                  <Button
                    disabled={isBusy || localBusy || !fileName.trim() || !content.trim()}
                    type="submit"
                  >
                    {t('确认创建')}
                  </Button>
                </div>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>

        {pendingClassification && conflicts.length > 0 && (
          <MetadataConflictDialog
            choices={conflictChoices}
            conflicts={conflicts}
            onApply={() => applyClassification(pendingClassification, conflictChoices)}
            onCancel={() => {
              setPendingClassification(null)
              setConflicts([])
              setConflictChoices({})
            }}
            onChoice={(key, choice) =>
              setConflictChoices(current => ({ ...current, [key]: choice }))
            }
          />
        )}
        {requestPreview && (
          <AiRequestPreviewDialog
            allowCancelWhileBusy
            busy={localBusy}
            onCancel={() => {
              if (activeClassificationRequestId.current) cancelClassification()
              else setRequestPreview(null)
            }}
            onConfirm={() => void executeClassification()}
            preview={requestPreview}
            returnFocusTo={previewReturnFocusRef.current}
            progressText={
              classificationStartedAt === null
                ? undefined
                : t('AI 正在生成 · 已等待 {seconds} 秒', {
                    seconds: classificationElapsedSeconds,
                  })
            }
          />
        )}
      </Dialog.Root>
      <BatchTemplateImportDialog
        onComplete={result => {
          onBatchComplete(result)
          setBatchOpen(false)
        }}
        onOpenChange={setBatchOpen}
        open={batchOpen}
      />
    </>
  )
}
