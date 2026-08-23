import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, CheckCircle2, LoaderCircle, Search, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  CompletableTemplateMetadataField,
  ExistingTemplateMetadataCompletionDraft,
  ExistingTemplateMetadataCompletionPreview,
  TemplateMetadataFields,
  TemplateMetadataLanguage,
} from '@core/contracts/template-management'
import type { BackgroundTaskStatus } from '@core/contracts/background-task'
import type { TemplatePage, TemplateSummary } from '@core/contracts/workspace'

import { AiRequestPreviewDialog } from '@/components/ai-request-preview-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'
import { runTrackedOperation } from '@/lib/background-task'

type BusyMode = 'apply' | 'generate' | 'preview' | null

const fieldLabels: Record<CompletableTemplateMetadataField, string> = {
  commonMistakes: '常见错误',
  constraints: '适用约束',
  prerequisites: '前置条件',
  solves: '解决的问题',
  spaceComplexity: '空间复杂度',
  tags: '标签',
  timeComplexity: '时间复杂度',
}

function displayValue(value: TemplateMetadataFields[CompletableTemplateMetadataField]): string {
  if (Array.isArray(value)) return value.join('、') || '未填写'
  return value?.trim() || '未填写'
}

export function TemplateMetadataCompletionDialog({
  initialTemplate,
  onApplied,
  onClose,
  returnFocusTo,
}: {
  initialTemplate: TemplateSummary | null
  onApplied: (templateIds: string[]) => void
  onClose: () => void
  returnFocusTo?: HTMLElement | null
}) {
  const { t } = useI18n()
  const isSingle = Boolean(initialTemplate)
  const [busy, setBusy] = useState<BusyMode>(null)
  const [taskStatus, setTaskStatus] = useState<BackgroundTaskStatus | null>(null)
  const [draft, setDraft] = useState<ExistingTemplateMetadataCompletionDraft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<TemplateMetadataLanguage>('zh-CN')
  const [page, setPage] = useState<TemplatePage | null>(null)
  const [preview, setPreview] = useState<ExistingTemplateMetadataCompletionPreview | null>(null)
  const [query, setQuery] = useState('')
  const [selectedFields, setSelectedFields] = useState<
    Record<string, CompletableTemplateMetadataField[]>
  >({})
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialTemplate ? [initialTemplate.id] : []),
  )
  const activeRequestId = useRef<string | null>(null)

  useEffect(() => {
    if (isSingle) return
    let active = true
    const timer = window.setTimeout(() => {
      void window.desktop.templates
        .listPage({ cursor: null, limit: 100, query: query.trim() })
        .then(result => active && setPage(result))
        .catch(caught => {
          if (active) setError(caught instanceof Error ? caught.message : t('无法读取模板列表。'))
        })
    }, 160)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [isSingle, query, t])

  const selectedCount = selectedIds.size
  const selectedChangeCount = useMemo(
    () => Object.values(selectedFields).reduce((total, fields) => total + fields.length, 0),
    [selectedFields],
  )

  const close = () => {
    if (busy) return
    onClose()
  }

  const loadMore = async () => {
    if (!page?.nextCursor || busy) return
    setError(null)
    try {
      const next = await window.desktop.templates.listPage({
        cursor: page.nextCursor,
        limit: 100,
        query: query.trim(),
      })
      setPage(current =>
        current
          ? {
              ...next,
              items: [
                ...current.items,
                ...next.items.filter(
                  item => !current.items.some(currentItem => currentItem.id === item.id),
                ),
              ],
              processedCount: current.processedCount + next.processedCount,
            }
          : next,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法读取更多模板。'))
    }
  }

  const previewRequest = async () => {
    if (selectedIds.size === 0 || selectedIds.size > 20 || busy) return
    setBusy('preview')
    setError(null)
    try {
      const result = await window.desktop.templateManagement.previewExistingMetadataCompletion({
        outputLanguage: language,
        templateIds: [...selectedIds],
      })
      setPreview(result)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法生成 AI 发送预览。'))
    } finally {
      setBusy(null)
    }
  }

  const generate = async () => {
    if (!preview || busy) return
    const requestId = crypto.randomUUID()
    activeRequestId.current = requestId
    setBusy('generate')
    setTaskStatus(null)
    setError(null)
    try {
      const result = await runTrackedOperation(
        requestId,
        () =>
          window.desktop.templateManagement.generateExistingMetadataCompletion({
            previewId: preview.previewId,
            requestId,
          }),
        setTaskStatus,
      )
      setDraft(result)
      setSelectedFields(
        Object.fromEntries(result.items.map(item => [item.template.id, item.changedFields])),
      )
      setPreview(null)
    } catch (caught) {
      setPreview(null)
      setError(caught instanceof Error ? caught.message : t('AI 元数据补全未完成。'))
    } finally {
      activeRequestId.current = null
      setBusy(null)
    }
  }

  const cancelGeneration = () => {
    const requestId = activeRequestId.current
    if (!requestId) {
      setPreview(null)
      return
    }
    void window.desktop.templateManagement.cancelClassification(requestId)
  }

  const apply = async () => {
    if (!draft || selectedChangeCount === 0 || busy) return
    setBusy('apply')
    setError(null)
    try {
      const selections = Object.entries(selectedFields).flatMap(([templateId, fields]) =>
        fields.length ? [{ fields, templateId }] : [],
      )
      const result = await window.desktop.templateManagement.applyExistingMetadataCompletion({
        confirmed: true,
        draftId: draft.draftId,
        selections,
      })
      onApplied(result.metadata.map(metadata => metadata.templateId))
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('无法保存 AI 元数据补全结果。'))
    } finally {
      setBusy(null)
    }
  }

  const toggleTemplate = (templateId: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(templateId)) next.delete(templateId)
      else if (next.size < 20) next.add(templateId)
      return next
    })
  }

  const toggleField = (templateId: string, field: CompletableTemplateMetadataField) => {
    setSelectedFields(current => {
      const fields = new Set(current[templateId] ?? [])
      if (fields.has(field)) fields.delete(field)
      else fields.add(field)
      return { ...current, [templateId]: [...fields] }
    })
  }

  return (
    <Dialog.Root onOpenChange={open => !open && close()} open>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[70] bg-overlay/75 backdrop-blur-[4px]" />
        <Dialog.Content
          className="dialog-surface fixed left-1/2 top-1/2 z-[71] flex max-h-[min(820px,calc(100vh-28px))] w-[min(900px,calc(100vw-28px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/20 bg-panel shadow-2xl outline-none"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <header className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-sm font-semibold">
                {t(isSingle ? 'AI 补全模板元数据' : '批量 AI 补全元数据')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('只补全空白字段；已有内容和用户笔记保持不变，确认前不会写入。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭元数据补全')}
              disabled={Boolean(busy)}
              onClick={close}
              size="close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700 dark:text-red-300">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{t(error)}</span>
              </div>
            )}

            {!draft ? (
              <div className="space-y-4">
                {initialTemplate ? (
                  <section className="rounded-xl border border-border bg-background/60 p-4">
                    <p className="text-sm font-semibold">{initialTemplate.name}</p>
                    <p className="mt-1 break-all text-[11px] text-muted-foreground">
                      {initialTemplate.relativePath}
                    </p>
                  </section>
                ) : (
                  <section className="rounded-xl border border-border bg-background/45 p-4">
                    <div className="flex h-9 items-center gap-2 rounded-xl border border-border bg-panel px-3 focus-within:ring-2 focus-within:ring-ring">
                      <Search aria-hidden="true" className="size-4 text-muted-foreground" />
                      <input
                        aria-label={t('搜索待补全模板')}
                        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                        onChange={event => setQuery(event.target.value)}
                        placeholder={t('按名称或路径搜索')}
                        value={query}
                      />
                    </div>
                    <div
                      aria-label={t('选择待补全模板')}
                      className="mt-3 max-h-80 space-y-2 overflow-y-auto"
                    >
                      {(page?.items ?? []).map(template => {
                        const checked = selectedIds.has(template.id)
                        return (
                          <label
                            className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-panel/70 p-3 hover:border-primary/30"
                            key={template.id}
                          >
                            <input
                              aria-label={`${t('选择模板')} ${template.name}`}
                              checked={checked}
                              disabled={!checked && selectedCount >= 20}
                              onChange={() => toggleTemplate(template.id)}
                              type="checkbox"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">
                                {template.name}
                              </span>
                              <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                                {template.relativePath}
                              </span>
                            </span>
                            <Badge>{template.language}</Badge>
                          </label>
                        )
                      })}
                    </div>
                    {page?.nextCursor && (
                      <Button
                        className="mt-3 w-full"
                        onClick={() => void loadMore()}
                        size="compact"
                        type="button"
                        variant="outline"
                      >
                        {t('加载更多模板')}
                      </Button>
                    )}
                  </section>
                )}

                <section className="grid gap-4 rounded-xl border border-border bg-background/60 p-4 sm:grid-cols-[1fr_220px]">
                  <div>
                    <p className="text-xs font-semibold">{t('补全范围')}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                      {t('最多选择 20 份；没有空白字段的模板不会调用 AI。')}
                    </p>
                    <p className="mt-2 text-xs font-medium">
                      {t('已选择 {count} 份模板', { count: selectedCount })}
                    </p>
                  </div>
                  <label className="text-[11px] font-medium">
                    {t('补全语言')}
                    <select
                      aria-label={t('已有模板补全语言')}
                      className="mt-1.5 h-9 w-full rounded-lg border border-border bg-panel px-3 text-xs outline-none focus:ring-2 focus:ring-ring"
                      onChange={event =>
                        setLanguage(event.target.value as TemplateMetadataLanguage)
                      }
                      value={language}
                    >
                      <option value="zh-CN">{t('简体中文')}</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                </section>
              </div>
            ) : (
              <div className="space-y-4">
                <section className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CheckCircle2 className="size-4 text-success" />
                    <p className="text-xs font-semibold">{t('AI 补全草稿已生成')}</p>
                    <Badge>{draft.providerName}</Badge>
                    <Badge>{draft.model}</Badge>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {t('逐字段检查并取消不需要的建议；保存时整批成功或整批失败。')}
                  </p>
                </section>

                {draft.items.map(item => (
                  <article
                    className="rounded-xl border border-border bg-background/55 p-4"
                    key={item.template.id}
                  >
                    <div className="flex flex-wrap items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{item.template.name}</p>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {item.template.relativePath}
                        </p>
                      </div>
                      <Badge tone={item.changedFields.length ? 'accent' : 'neutral'}>
                        {item.changedFields.length
                          ? t('{count} 个建议字段', { count: item.changedFields.length })
                          : t('无需补全')}
                      </Badge>
                    </div>
                    {item.changedFields.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {item.changedFields.map(field => {
                          const checked = (selectedFields[item.template.id] ?? []).includes(field)
                          return (
                            <label
                              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-panel/70 p-3"
                              key={field}
                            >
                              <input
                                aria-label={`${item.template.name} ${t(fieldLabels[field])}`}
                                checked={checked}
                                onChange={() => toggleField(item.template.id, field)}
                                type="checkbox"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-semibold">
                                  {t(fieldLabels[field])}
                                </span>
                                <span className="mt-1 block whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground">
                                  {displayValue(item.proposedMetadata[field])}
                                </span>
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/65 px-5 py-4">
            <Button
              disabled={Boolean(busy)}
              onClick={close}
              size="compact"
              type="button"
              variant="ghost"
            >
              {t('取消')}
            </Button>
            {!draft ? (
              <Button
                disabled={selectedCount === 0 || selectedCount > 20 || Boolean(busy)}
                onClick={() => void previewRequest()}
                size="compact"
                type="button"
              >
                {busy === 'preview' ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {t('预览并补全')}
              </Button>
            ) : (
              <Button
                disabled={selectedChangeCount === 0 || Boolean(busy)}
                onClick={() => void apply()}
                size="compact"
                type="button"
              >
                {busy === 'apply' && <LoaderCircle className="size-4 animate-spin" />}
                {t('保存 {count} 个字段', { count: selectedChangeCount })}
              </Button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>

      {preview && (
        <AiRequestPreviewDialog
          allowCancelWhileBusy
          busy={busy === 'generate'}
          onCancel={cancelGeneration}
          onConfirm={() => void generate()}
          preview={preview}
          progressText={
            busy === 'generate' && !taskStatus
              ? t('正在逐份补全 {count} 份模板…', { count: preview.templateCount })
              : undefined
          }
          taskStatus={taskStatus}
        />
      )}
    </Dialog.Root>
  )
}
