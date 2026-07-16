import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, Link2, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

import type { Problem, RelationType, UpsertProblemRelationRequest } from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { relationTypeLabels } from '../problems/problem-labels'

interface TemplateProblemRelationDialogProps {
  error: string | null
  isBusy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (request: UpsertProblemRelationRequest) => Promise<boolean>
  open: boolean
  problems: Problem[]
  template: TemplateSummary
}

export function TemplateProblemRelationDialog({
  error,
  isBusy,
  onOpenChange,
  onSave,
  open,
  problems,
  template,
}: TemplateProblemRelationDialogProps) {
  const { t } = useI18n()
  const candidates = useMemo(
    () =>
      problems.filter(
        problem => !problem.relations.some(relation => relation.templateId === template.id),
      ),
    [problems, template.id],
  )
  const [note, setNote] = useState('')
  const [relationType, setRelationType] = useState<RelationType>('used')
  const [problemId, setProblemId] = useState('')

  useEffect(() => {
    if (!open) return
    setNote('')
    setRelationType('used')
    setProblemId(candidates[0]?.id ?? '')
  }, [candidates, open, template.id])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!problemId) return
    if (await onSave({ note, problemId, relationType, templateId: template.id })) {
      onOpenChange(false)
    }
  }

  const inputClass =
    'mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-ring'

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[60] bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-[60] w-[min(540px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Link2 aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="truncate text-sm font-semibold">
                {t('关联题目')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('将“{name}”关联到一道已有题目；题目和模板都不会被复制或移动。', {
                  name: template.name,
                })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭题目关联设置')}
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
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/25 px-4 py-4 text-xs leading-5 text-muted-foreground">
                {t(
                  '当前题库中的题目都已经关联到该模板。你可以在下方的关联题目卡片中打开题目，修改关系类型或解除关联。',
                )}
              </p>
            ) : (
              <>
                <label className="text-xs font-semibold" htmlFor="template-relation-problem">
                  {t('选择题目')}
                </label>
                <select
                  className={inputClass}
                  disabled={isBusy}
                  id="template-relation-problem"
                  onChange={event => setProblemId(event.target.value)}
                  required
                  value={problemId}
                >
                  {candidates.map(problem => (
                    <option key={problem.id} value={problem.id}>
                      {problem.title}
                      {problem.problemCode ? ` · ${problem.problemCode}` : ''}
                    </option>
                  ))}
                </select>
                <label
                  className="mt-4 block text-xs font-semibold"
                  htmlFor="template-relation-type"
                >
                  {t('关系类型')}
                </label>
                <select
                  className={inputClass}
                  disabled={isBusy}
                  id="template-relation-type"
                  onChange={event => setRelationType(event.target.value as RelationType)}
                  value={relationType}
                >
                  {Object.entries(relationTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
                <label
                  className="mt-4 block text-xs font-semibold"
                  htmlFor="template-relation-note"
                >
                  {t('关联备注')}
                </label>
                <textarea
                  className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  disabled={isBusy}
                  id="template-relation-note"
                  maxLength={500}
                  onChange={event => setNote(event.target.value)}
                  placeholder={t('例如：本题实际使用该模板作为基础实现。')}
                  value={note}
                />
              </>
            )}
            <footer className="mt-5 flex justify-end gap-2 border-t border-border pt-4">
              <Dialog.Close asChild>
                <Button type="button" variant="outline">
                  {t('取消')}
                </Button>
              </Dialog.Close>
              {candidates.length > 0 && (
                <Button disabled={isBusy || !problemId} type="submit">
                  {t('保存关联')}
                </Button>
              )}
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
