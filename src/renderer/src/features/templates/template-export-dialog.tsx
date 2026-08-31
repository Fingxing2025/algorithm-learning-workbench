import * as Dialog from '@radix-ui/react-dialog'
import { CheckCircle2, Download, FileText, LoaderCircle, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import type { TemplateExportResult } from '@core/contracts/template-export'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

export function TemplateExportDialog({
  onOpenChange,
  open,
  returnFocusTo,
  templates,
}: {
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusTo?: HTMLElement | null
  templates: TemplateSummary[]
}) {
  const { t } = useI18n()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [includeMetadata, setIncludeMetadata] = useState(false)
  const [compilePdf, setCompilePdf] = useState(false)
  const [generateDoc, setGenerateDoc] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TemplateExportResult | null>(null)
  const requestId = useRef<string | null>(null)

  const categories = useMemo(() => {
    const map = new Map<string, TemplateSummary[]>()
    for (const template of templates) {
      const parts = template.relativePath.split('/')
      const category = parts.length > 1 ? parts.slice(0, -1).join(' / ') : '未分类'
      const current = map.get(category) ?? []
      current.push(template)
      map.set(category, current)
    }
    return [...map.entries()].sort(([left], [right]) => left.localeCompare(right, 'zh-CN'))
  }, [templates])

  const toggle = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleCategory = (items: TemplateSummary[]) => {
    setSelectedIds(current => {
      const next = new Set(current)
      const allSelected = items.every(item => next.has(item.id))
      for (const item of items) {
        if (allSelected) next.delete(item.id)
        else next.add(item.id)
      }
      return next
    })
  }

  const close = () => {
    if (!busy) onOpenChange(false)
  }
  const startExport = async () => {
    if (busy || selectedIds.size === 0) return
    const id = crypto.randomUUID()
    requestId.current = id
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const value = await window.desktop.templates.export({
        compilePdf,
        generateDoc,
        includeMetadata,
        requestId: id,
        templateIds: [...selectedIds],
      })
      if (value) setResult(value)
      else onOpenChange(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('模板导出失败，请重试。'))
    } finally {
      requestId.current = null
      setBusy(false)
    }
  }
  const cancel = () => {
    const id = requestId.current
    if (id) void window.desktop.templates.cancelExport({ requestId: id })
    else close()
  }

  return (
    <Dialog.Root onOpenChange={openValue => !busy && onOpenChange(openValue)} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-overlay/70 backdrop-blur-[4px]" />
        <Dialog.Content
          aria-describedby="template-export-description"
          className="dialog-surface fixed left-1/2 top-1/2 z-[81] flex max-h-[min(780px,calc(100vh-32px))] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-primary/20 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-cyan/12 text-accent-cyan">
              <Download aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold">{t('导出算法模板册')}</Dialog.Title>
              <Dialog.Description
                id="template-export-description"
                className="mt-1 text-xs text-muted-foreground"
              >
                {t('选择单份、多份或分类；Main 将按稳定路径顺序生成 LaTeX。')}
              </Dialog.Description>
            </div>
            <Button
              aria-label={t('关闭导出')}
              className="ml-auto"
              disabled={busy}
              onClick={close}
              size="close"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" className="size-4" />
            </Button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {templates.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                <FileText aria-hidden="true" className="mx-auto mb-2 size-6" />
                {t('当前工作区没有可导出的模板。')}
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map(([category, items]) => (
                  <section
                    className="rounded-2xl border border-border bg-background/55 p-3"
                    key={category}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-xs font-semibold">{category}</h3>
                      <Badge>
                        {items.filter(item => selectedIds.has(item.id)).length}/{items.length}
                      </Badge>
                      <Button
                        onClick={() => toggleCategory(items)}
                        size="compact"
                        type="button"
                        variant="ghost"
                      >
                        {items.every(item => selectedIds.has(item.id))
                          ? t('取消分类')
                          : t('选择分类')}
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-1 sm:grid-cols-2">
                      {items
                        .sort((left, right) =>
                          left.relativePath.localeCompare(right.relativePath, 'zh-CN'),
                        )
                        .map(item => (
                          <label
                            className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/60"
                            key={item.id}
                          >
                            <input
                              checked={selectedIds.has(item.id)}
                              className="accent-primary"
                              onChange={() => toggle(item.id)}
                              type="checkbox"
                            />
                            <span className="min-w-0 truncate" title={item.relativePath}>
                              {item.name}
                            </span>
                          </label>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-border bg-muted/25 p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="accent">
                  {selectedIds.size} {t('份模板')}
                </Badge>
                <span className="text-muted-foreground">
                  {t('按分类、相对路径和模板 ID 稳定排序')}
                </span>
              </div>
              <p className="mt-2 text-muted-foreground">{t('预计文件名：算法模板册.tex')}</p>
              <label className="mt-3 flex items-center gap-2">
                <input
                  checked={includeMetadata}
                  onChange={event => setIncludeMetadata(event.target.checked)}
                  type="checkbox"
                />
                {t('代码 + 基础元数据（名称、复杂度、解决的问题、输入输出格式、标签）')}
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  checked={compilePdf}
                  onChange={event => setCompilePdf(event.target.checked)}
                  type="checkbox"
                />
                {t('同时生成 PDF（内置引擎，无需安装 TeX）')}
              </label>
              <label className="mt-2 flex items-center gap-2">
                <input
                  checked={generateDoc}
                  onChange={event => setGenerateDoc(event.target.checked)}
                  type="checkbox"
                />
                {t('同时生成 Word 文档（.doc）')}
              </label>
            </div>

            {error && (
              <div
                className="rounded-xl border border-red-500/25 bg-red-500/6 px-3 py-2 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                {t(error)}
              </div>
            )}
            {result && (
              <div
                className="rounded-xl border border-success/25 bg-success/7 px-3 py-3 text-xs"
                role="status"
              >
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="size-4 text-success" />
                  {t(result.compileMessage)}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {result.texFileName} · {result.templateCount} {t('份模板')} ·{' '}
                  {result.pdfStatus === 'generated'
                    ? t('PDF 已生成')
                    : result.pdfStatus === 'unavailable'
                      ? t('PDF 未验证')
                      : ''}{' '}
                  {result.docStatus === 'generated' ? t('Word 文档已生成') : ''}
                </p>
              </div>
            )}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-surface-subtle/70 px-5 py-4">
            <p className="text-[11px] text-muted-foreground">
              {t('不会修改模板源码、数据库或其他工作区。')}
            </p>
            <div className="ml-auto flex gap-2">
              {busy ? (
                <Button onClick={cancel} size="compact" type="button" variant="outline">
                  <X className="size-3.5" />
                  {t('取消导出')}
                </Button>
              ) : (
                <Button onClick={close} size="compact" type="button" variant="ghost">
                  {t('关闭')}
                </Button>
              )}
              {!busy && (
                <Button
                  disabled={selectedIds.size === 0 || templates.length === 0}
                  onClick={() => void startExport()}
                  size="compact"
                  type="button"
                >
                  <Download className="size-3.5" />
                  {t('选择位置并导出')}
                </Button>
              )}
              {busy && (
                <LoaderCircle
                  aria-hidden="true"
                  className="my-auto size-4 animate-spin text-primary"
                />
              )}
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
