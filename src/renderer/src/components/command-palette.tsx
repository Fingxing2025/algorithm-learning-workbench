import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, FileCode2, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { TemplateSummary } from '@core/contracts/workspace'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CommandPaletteProps {
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (templateId: string) => void
  open: boolean
  templates: TemplateSummary[]
}

export function CommandPalette({
  onOpenChange,
  onSelectTemplate,
  open,
  templates,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (!open) {
      setQuery('')
    }
  }, [open])

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('zh-CN')
    if (!normalized) {
      return templates.slice(0, 6)
    }
    return templates
      .filter(template =>
        `${template.name} ${template.relativePath} ${template.language}`
          .toLocaleLowerCase('zh-CN')
          .includes(normalized),
      )
      .slice(0, 10)
  }, [query, templates])

  const selectTemplate = (templateId: string) => {
    onSelectTemplate(templateId)
    onOpenChange(false)
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/55 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[15%] z-50 w-[min(640px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl outline-none">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <input
              aria-label="搜索模板、题目或操作"
              autoFocus
              className="h-14 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onChange={event => setQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && results[0]) {
                  selectTemplate(results[0].id)
                }
              }}
              placeholder="搜索模板名称、路径或语言…"
              value={query}
            />
            <Dialog.Close asChild>
              <Button aria-label="关闭全局搜索" size="icon" type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="max-h-[360px] min-h-44 overflow-y-auto p-2">
            <Dialog.Title className="sr-only">全局搜索</Dialog.Title>
            <Dialog.Description className="sr-only">
              搜索并定位当前工作区中的算法模板。
            </Dialog.Description>
            {results.length > 0 ? (
              <div className="space-y-1">
                {results.map(template => (
                  <button
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                    key={template.id}
                    onClick={() => selectTemplate(template.id)}
                    type="button"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <FileCode2 aria-hidden="true" className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{template.name}</span>
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {template.relativePath}
                      </span>
                    </span>
                    <Badge>{template.language}</Badge>
                    <ArrowRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border bg-muted/30 px-5 text-center">
                <div>
                  <p className="text-sm font-semibold">
                    {templates.length === 0 ? '工作区中还没有模板' : `没有找到“${query}”`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {templates.length === 0
                      ? '连接工作区或新建第一份模板后即可搜索。'
                      : '尝试名称、路径或语言关键词。'}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/35 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>{templates.length} 个可搜索模板</span>
            <span className="inline-flex items-center gap-1">Enter 打开第一个结果</span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
