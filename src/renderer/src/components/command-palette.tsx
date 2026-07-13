import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, Search, X } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface CommandPaletteProps {
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function CommandPalette({ onOpenChange, open }: CommandPaletteProps) {
  const [query, setQuery] = useState('')

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/55 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-50 w-[min(620px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl outline-none">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search aria-hidden="true" className="size-4 text-muted-foreground" />
            <input
              aria-label="搜索模板、题目或操作"
              autoFocus
              className="h-14 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              onChange={event => setQuery(event.target.value)}
              placeholder="搜索模板、题目或操作…"
              value={query}
            />
            <Dialog.Close asChild>
              <Button aria-label="关闭全局搜索" size="icon" type="button" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="p-3">
            <div className="rounded-xl border border-dashed border-border bg-muted/45 px-5 py-8 text-center">
              <Dialog.Title className="text-sm font-semibold text-foreground">
                {query ? `暂未找到“${query}”` : '全局搜索已就绪'}
              </Dialog.Title>
              <Dialog.Description className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
                阶段 1 接入模板索引后，这里会定位模板树、题目卡片与常用操作。
              </Dialog.Description>
              <Badge className="mt-4" tone="accent">
                Cmd / Ctrl + K
              </Badge>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border bg-muted/35 px-4 py-2.5 text-[11px] text-muted-foreground">
            <span>输入关键词开始筛选</span>
            <span className="inline-flex items-center gap-1">
              Enter 选择 <ArrowRight aria-hidden="true" className="size-3" />
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
