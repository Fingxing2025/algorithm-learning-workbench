import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, BookOpenText, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import {
  emptyProblemAnalysisStructure,
  type CreateProblemRequest,
  type Problem,
} from '@core/contracts/problem'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

import { problemStatusLabels } from './problem-labels'

interface ProblemEditorDialogProps {
  error: string | null
  isBusy: boolean
  onOpenChange: (open: boolean) => void
  onSave: (fields: CreateProblemRequest) => Promise<boolean>
  open: boolean
  problem: Problem | null
}

function emptyFields(): CreateProblemRequest {
  return {
    aiSummary: '',
    analysis: { ...emptyProblemAnalysisStructure },
    difficulty: null,
    notes: '',
    platform: null,
    problemCode: null,
    statement: '',
    status: 'unattempted',
    tags: [],
    title: '',
    url: null,
  }
}

function toNullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function ProblemEditorDialog({
  error,
  isBusy,
  onOpenChange,
  onSave,
  open,
  problem,
}: ProblemEditorDialogProps) {
  const { t } = useI18n()
  const [fields, setFields] = useState<CreateProblemRequest>(emptyFields)
  const [tagsText, setTagsText] = useState('')

  useEffect(() => {
    if (!open) {
      return
    }
    if (problem) {
      setFields({
        aiSummary: problem.aiSummary,
        analysis: problem.analysis,
        difficulty: problem.difficulty,
        notes: problem.notes,
        platform: problem.platform,
        problemCode: problem.problemCode,
        statement: problem.statement,
        status: problem.status,
        tags: problem.tags,
        title: problem.title,
        url: problem.url,
      })
      setTagsText(problem.tags.join(', '))
    } else {
      setFields(emptyFields())
      setTagsText('')
    }
  }, [open, problem])

  const updateText = (key: 'difficulty' | 'platform' | 'problemCode' | 'url', value: string) =>
    setFields(current => ({ ...current, [key]: toNullable(value) }))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const tags = tagsText
      .split(/[,，]/)
      .map(tag => tag.trim())
      .filter(Boolean)
    if (await onSave({ ...fields, tags: [...new Set(tags)] })) {
      onOpenChange(false)
    }
  }

  const inputClass =
    'mt-1.5 h-9 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-success/40 focus:ring-2 focus:ring-success'

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[3px]" />
        <Dialog.Content className="dialog-surface fixed left-1/2 top-1/2 z-50 flex h-[min(780px,calc(100vh-32px))] w-[min(820px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-success/18 bg-panel shadow-2xl outline-none ring-1 ring-white/8">
          <header className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-success/11 text-success ring-1 ring-success/12">
              <BookOpenText aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                {t(problem ? '编辑题目卡片' : '新建题目卡片')}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                {t('题目和备注保存在本地数据库；模板关联可在保存后继续编辑。')}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                aria-label={t('关闭题目编辑器')}
                className="ml-auto"
                size="close"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </header>

          <form className="min-h-0 flex-1 overflow-y-auto p-5" onSubmit={handleSubmit}>
            {error && (
              <div
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{t(error)}</span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('题目标题')}
                <input
                  autoFocus
                  className={inputClass}
                  maxLength={200}
                  onChange={event =>
                    setFields(current => ({ ...current, title: event.target.value }))
                  }
                  placeholder={t('例如 最短路计数')}
                  required
                  value={fields.title}
                />
              </label>
              <label className="text-xs font-semibold">
                {t('平台')}
                <input
                  className={inputClass}
                  maxLength={80}
                  onChange={event => updateText('platform', event.target.value)}
                  placeholder={t('洛谷、Codeforces…')}
                  value={fields.platform ?? ''}
                />
              </label>
              <label className="text-xs font-semibold">
                {t('题号')}
                <input
                  className={inputClass}
                  maxLength={80}
                  onChange={event => updateText('problemCode', event.target.value)}
                  placeholder="P3371"
                  value={fields.problemCode ?? ''}
                />
              </label>
              <label className="text-xs font-semibold">
                {t('难度')}
                <input
                  className={inputClass}
                  maxLength={40}
                  onChange={event => updateText('difficulty', event.target.value)}
                  placeholder={t('普及+/提高、1600…')}
                  value={fields.difficulty ?? ''}
                />
              </label>
              <label className="text-xs font-semibold">
                {t('状态')}
                <select
                  className={inputClass}
                  onChange={event =>
                    setFields(current => ({
                      ...current,
                      status: event.target.value as CreateProblemRequest['status'],
                    }))
                  }
                  value={fields.status}
                >
                  {Object.entries(problemStatusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('题目链接')}
                <input
                  className={inputClass}
                  maxLength={2048}
                  onChange={event => updateText('url', event.target.value)}
                  placeholder="https://…"
                  type="url"
                  value={fields.url ?? ''}
                />
              </label>
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('标签')}
                <input
                  className={inputClass}
                  onChange={event => setTagsText(event.target.value)}
                  placeholder={t('最短路, 图论, Dijkstra')}
                  value={tagsText}
                />
                <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                  {t('使用逗号分隔，最多 20 个标签。')}
                </span>
              </label>
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('原始题面')}
                <textarea
                  className="mt-1.5 min-h-32 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  onChange={event =>
                    setFields(current => ({ ...current, statement: event.target.value }))
                  }
                  placeholder={t('记录原始题面、输入输出和数据范围…')}
                  value={fields.statement}
                />
              </label>
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('AI 题目摘要')}
                <textarea
                  className="mt-1.5 min-h-24 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  onChange={event =>
                    setFields(current => ({ ...current, aiSummary: event.target.value }))
                  }
                  placeholder={t('可选：题目的简洁结构化摘要…')}
                  value={fields.aiSummary}
                />
              </label>
              <label className="sm:col-span-2 text-xs font-semibold">
                {t('本地备注')}
                <textarea
                  className="mt-1.5 min-h-28 w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                  onChange={event =>
                    setFields(current => ({ ...current, notes: event.target.value }))
                  }
                  placeholder={t('记录思路、错误原因或复盘…')}
                  value={fields.notes}
                />
              </label>
            </div>

            <footer className="mt-5 flex items-center justify-between gap-4 border-t border-border pt-4">
              <p className="text-[11px] text-muted-foreground">{t('所有内容默认只保存在本机。')}</p>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    {t('取消')}
                  </Button>
                </Dialog.Close>
                <Button disabled={isBusy || !fields.title.trim()} type="submit">
                  {t(problem ? '保存修改' : '创建题目')}
                </Button>
              </div>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
