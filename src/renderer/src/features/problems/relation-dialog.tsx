import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Link2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import type {
  ProblemTemplateRelation,
  RelationType,
  UpsertProblemRelationRequest,
} from '@core/contracts/problem'
import type { TemplatePage, TemplateSummary } from '@core/contracts/workspace'

import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

import { relationTypeLabels } from './problem-labels'

interface RelationDialogProps {
  error: string | null
  existing: ProblemTemplateRelation | null
  excludedTemplateIds: string[]
  initialTemplates: TemplateSummary[]
  isBusy: boolean
  onOpenChange: (open: boolean) => void
  onSearchTemplates: (query: string) => Promise<TemplatePage>
  onSave: (request: UpsertProblemRelationRequest) => Promise<boolean>
  open: boolean
  problemId: string
  returnFocusTo?: HTMLElement | null
}

export function RelationDialog({
  error,
  existing,
  excludedTemplateIds,
  initialTemplates,
  isBusy,
  onOpenChange,
  onSearchTemplates,
  onSave,
  open,
  problemId,
  returnFocusTo,
}: RelationDialogProps) {
  const { t } = useI18n()
  const [note, setNote] = useState('')
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [relationType, setRelationType] = useState<RelationType>('used')
  const [templateQuery, setTemplateQuery] = useState('')
  const [templates, setTemplates] = useState<TemplateSummary[]>(initialTemplates)
  const [templateId, setTemplateId] = useState('')

  useEffect(() => {
    if (!open || existing) return
    let active = true
    setIsLoadingTemplates(true)
    const timer = window.setTimeout(() => {
      void onSearchTemplates(templateQuery.trim())
        .then(page => {
          if (!active) return
          const excluded = new Set(excludedTemplateIds)
          setTemplates(page.items.filter(template => !excluded.has(template.id)))
        })
        .catch(() => {
          if (active) setTemplates([])
        })
        .finally(() => {
          if (active) setIsLoadingTemplates(false)
        })
    }, 180)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [excludedTemplateIds, existing, onSearchTemplates, open, templateQuery])

  useEffect(() => {
    if (!open) {
      return
    }
    setNote(existing?.note ?? '')
    setRelationType(existing?.relationType ?? 'used')
    const excluded = new Set(excludedTemplateIds)
    const initialCandidates = initialTemplates.filter(template => !excluded.has(template.id))
    setTemplates(initialCandidates)
    setTemplateId(existing?.templateId ?? initialCandidates[0]?.id ?? '')
    setTemplateQuery('')
  }, [excludedTemplateIds, existing, initialTemplates, open])

  useEffect(() => {
    if (!open || existing) return
    setTemplateId(current =>
      templates.some(template => template.id === current) ? current : (templates[0]?.id ?? ''),
    )
  }, [existing, open, templates])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (templateId && (await onSave({ note, problemId, relationType, templateId }))) {
      onOpenChange(false)
    }
  }

  const inputClass =
    'mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-success/40 focus:ring-2 focus:ring-success'

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content
          className="dialog-surface fixed left-1/2 top-1/2 z-[60] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-success/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
              <Link2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {t(existing ? '编辑模板关联' : '关联算法模板')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('解除关联不会删除题目、模板或源码。')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭关联编辑器')}
                className="ml-auto"
                size="close"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          <form className="p-5" onSubmit={handleSubmit}>
            {error && (
              <div
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{t(error)}</span>
              </div>
            )}
            {!existing && (
              <>
                <label className="text-xs font-semibold" htmlFor="relation-template-search">
                  {t('搜索模板')}
                </label>
                <input
                  className={inputClass}
                  id="relation-template-search"
                  onChange={event => setTemplateQuery(event.target.value)}
                  placeholder={t('搜索模板名称或路径')}
                  value={templateQuery}
                />
              </>
            )}
            <label className="mt-4 block text-xs font-semibold" htmlFor="relation-template">
              {t('算法模板')}
            </label>
            <select
              autoFocus={!existing}
              className={inputClass}
              disabled={Boolean(existing)}
              id="relation-template"
              onChange={event => setTemplateId(event.target.value)}
              required
              value={templateId}
            >
              {existing ? (
                <option value={existing.templateId}>
                  {existing.templateName} · {existing.templatePath}
                </option>
              ) : (
                templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} · {template.relativePath}
                  </option>
                ))
              )}
            </select>
            {!existing && (isLoadingTemplates || templates.length === 0) && (
              <p className="mt-2 text-[10px] text-muted-foreground">
                {t(
                  isLoadingTemplates
                    ? '正在搜索完整模板索引…'
                    : '当前批次没有可关联模板，请搜索名称或路径。',
                )}
              </p>
            )}
            <label className="mt-4 block text-xs font-semibold" htmlFor="relation-type">
              {t('关系类型')}
            </label>
            <select
              autoFocus={Boolean(existing)}
              className={inputClass}
              id="relation-type"
              onChange={event => setRelationType(event.target.value as RelationType)}
              value={relationType}
            >
              {Object.entries(relationTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-xs font-semibold" htmlFor="relation-note">
              {t('关联备注')}
            </label>
            <textarea
              className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              id="relation-note"
              maxLength={500}
              onChange={event => setNote(event.target.value)}
              placeholder={t('例如：本题实际使用了该模板的堆优化版本。')}
              value={note}
            />
            <footer className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  {t('取消')}
                </Button>
              </Dialog.Close>
              <Button disabled={isBusy || !templateId} type="submit">
                {t('保存关联')}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
