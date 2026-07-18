import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, BookOpenText, FileCode2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { Problem } from '@core/contracts/problem'
import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { restoreFocusAfterDialog } from '@/lib/focus-management'
import { useI18n } from '@/lib/i18n'

interface CommandPaletteProps {
  onOpenChange: (open: boolean) => void
  onSelectProblem: (problemId: string) => void
  onSelectTemplate: (templateId: string) => void
  open: boolean
  problems: Problem[]
  returnFocusTo?: HTMLElement | null
  templates: TemplateSummary[]
}

type SearchResult =
  { kind: 'problem'; value: Problem } | { kind: 'template'; value: TemplateSummary }

export function CommandPalette({
  onOpenChange,
  onSelectProblem,
  onSelectTemplate,
  open,
  problems,
  returnFocusTo,
  templates,
}: CommandPaletteProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const results = useMemo<SearchResult[]>(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    const matchedTemplates = templates.filter(template =>
      `${template.name} ${template.relativePath} ${template.language}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalized),
    )
    const matchedProblems = problems.filter(problem =>
      `${problem.title} ${problem.platform ?? ''} ${problem.problemCode ?? ''} ${problem.tags.join(' ')}`
        .toLocaleLowerCase('zh-CN')
        .includes(normalized),
    )

    if (!normalized) {
      return [
        ...matchedTemplates.slice(0, 4).map<SearchResult>(value => ({ kind: 'template', value })),
        ...matchedProblems.slice(0, 4).map<SearchResult>(value => ({ kind: 'problem', value })),
      ]
    }
    return [
      ...matchedTemplates.map<SearchResult>(value => ({ kind: 'template', value })),
      ...matchedProblems.map<SearchResult>(value => ({ kind: 'problem', value })),
    ].slice(0, 12)
  }, [problems, query, templates])

  const selectResult = (result: SearchResult) => {
    if (result.kind === 'template') {
      onSelectTemplate(result.value.id)
    } else {
      onSelectProblem(result.value.id)
    }
    onOpenChange(false)
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-overlay/58 backdrop-blur-[3px]" />
        <Dialog.Content
          className="dialog-surface fixed left-1/2 top-[13%] z-50 w-[min(700px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-3xl border border-primary/18 bg-panel shadow-[0_32px_80px_-32px_var(--shadow-color)] outline-none ring-1 ring-white/8"
          onCloseAutoFocus={event => restoreFocusAfterDialog(event, returnFocusTo)}
        >
          <div className="flex items-center gap-3 border-b border-border bg-surface-subtle/55 px-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/10">
              <Search aria-hidden="true" className="size-4" />
            </span>
            <input
              aria-label={t('搜索模板、题目或操作')}
              autoFocus
              className="h-16 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && results[0]) {
                  selectResult(results[0])
                }
              }}
              placeholder={t('搜索模板名称、路径、题目或标签…')}
              value={query}
            />
            <Dialog.Close asChild>
              <Button aria-label={t('关闭全局搜索')} size="close" type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="max-h-[420px] min-h-44 overflow-y-auto p-2.5">
            <Dialog.Title className="sr-only">{t('全局搜索')}</Dialog.Title>
            <Dialog.Description className="sr-only">
              {t('搜索并打开算法模板或本地题目卡片。')}
            </Dialog.Description>
            {results.length > 0 ? (
              <div className="space-y-1">
                {results.map(result => {
                  const isTemplate = result.kind === 'template'
                  const title = result.kind === 'template' ? result.value.name : result.value.title
                  const description =
                    result.kind === 'template'
                      ? result.value.relativePath
                      : [result.value.platform, result.value.problemCode]
                          .filter(Boolean)
                          .join(' · ') || t('本地题目卡片')
                  return (
                    <button
                      className="group flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left outline-none transition-all hover:translate-x-0.5 hover:border-border hover:bg-surface-subtle focus-visible:bg-muted"
                      key={`${result.kind}:${result.value.id}`}
                      onClick={() => selectResult(result)}
                      type="button"
                    >
                      <span
                        className={
                          isTemplate
                            ? 'grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary'
                            : 'grid size-9 shrink-0 place-items-center rounded-xl bg-success/10 text-success'
                        }
                      >
                        {isTemplate ? (
                          <FileCode2 aria-hidden="true" className="size-4" />
                        ) : (
                          <BookOpenText aria-hidden="true" className="size-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{title}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                          {description}
                        </span>
                      </span>
                      <Badge>
                        {result.kind === 'template' ? result.value.language : t('题目')}
                      </Badge>
                      <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-5 text-center">
                <div>
                  <p className="text-sm font-semibold">
                    {templates.length + problems.length === 0
                      ? t('本地知识库还是空的')
                      : t('没有找到“{query}”', { query })}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {templates.length + problems.length === 0
                      ? t('连接模板工作区或创建题目后即可搜索。')
                      : t('尝试模板名称、路径、题号或标签。')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-surface-subtle/65 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>
              {templates.length} {t('个模板')} · {problems.length} {t('道题')}
            </span>
            <span>{t('Enter 打开第一个结果')}</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
