import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, FilePlus2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import type { CreateTemplateRequest } from '@core/contracts/workspace'

import { Button } from '@/components/ui/button'

interface CreateTemplateDialogProps {
  error: string | null
  isBusy: boolean
  onCreate: (request: CreateTemplateRequest) => Promise<boolean>
  onOpenChange: (open: boolean) => void
  open: boolean
}

export function CreateTemplateDialog({
  error,
  isBusy,
  onCreate,
  onOpenChange,
  open,
}: CreateTemplateDialogProps) {
  const [content, setContent] = useState('')
  const [fileName, setFileName] = useState('')

  useEffect(() => {
    if (!open) {
      setContent('')
      setFileName('')
    }
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (await onCreate({ content, fileName })) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog.Root onOpenChange={onOpenChange} open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay/60 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,calc(100vh-40px))] w-[min(760px,calc(100vw-40px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl outline-none">
          <div className="flex items-start border-b border-border px-5 py-4">
            <span className="mr-3 grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <FilePlus2 aria-hidden="true" className="size-4" />
            </span>
            <div>
              <Dialog.Title className="text-sm font-semibold">新建算法模板</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                只会在当前工作区根目录创建新文件；同名文件绝不会被覆盖。
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                className="ml-auto"
                aria-label="关闭新建模板"
                size="icon"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form className="flex min-h-0 flex-1 flex-col p-5" onSubmit={handleSubmit}>
            {error && (
              <div
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <label className="text-xs font-semibold" htmlFor="template-file-name">
              文件名
            </label>
            <input
              autoFocus
              className="mt-2 h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              id="template-file-name"
              maxLength={160}
              onChange={event => setFileName(event.target.value)}
              placeholder="例如 dijkstra.cpp"
              required
              value={fileName}
            />

            <label className="mt-4 text-xs font-semibold" htmlFor="template-source">
              模板源码
            </label>
            <textarea
              className="mt-2 min-h-0 flex-1 resize-none rounded-xl border border-border bg-code px-4 py-3 font-mono text-xs leading-5 text-code-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              id="template-source"
              onChange={event => setContent(event.target.value)}
              placeholder="粘贴或输入模板源码…"
              spellCheck={false}
              value={content}
            />

            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-[11px] text-muted-foreground">
                支持常见源码扩展名，文件上限 2 MiB。
              </p>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </Dialog.Close>
                <Button disabled={isBusy || !fileName.trim()} type="submit">
                  确认创建
                </Button>
              </div>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
