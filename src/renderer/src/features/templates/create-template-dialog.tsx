import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, FilePlus2, LoaderCircle, Sparkles, Upload, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'

import type {
  ImportTemplateRequest,
  TemplateClassification,
} from '@core/contracts/template-management'

import { Button } from '@/components/ui/button'

interface CreateTemplateDialogProps {
  error: string | null
  isBusy: boolean
  onCreate: (request: ImportTemplateRequest) => Promise<boolean>
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
  const [classification, setClassification] = useState<TemplateClassification | null>(null)
  const [fileName, setFileName] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [localBusy, setLocalBusy] = useState(false)

  useEffect(() => {
    if (!open) {
      setContent('')
      setClassification(null)
      setFileName('')
      setLocalError(null)
    }
  }, [open])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (
      await onCreate({
        content,
        metadata: classification?.metadata ?? null,
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
        setClassification(null)
      }
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '无法读取源码文件。')
    } finally {
      setLocalBusy(false)
    }
  }

  const classify = async () => {
    setLocalBusy(true)
    setLocalError(null)
    try {
      const result = await window.desktop.templateManagement.classify({ content, fileName })
      setClassification(result)
      setFileName(result.suggestedRelativePath)
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : 'AI 分类未完成。')
    } finally {
      setLocalBusy(false)
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
                支持粘贴或上传源码；AI 只提出分类建议，同名文件绝不会被覆盖。
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
            {(error || localError) && (
              <div
                className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3 py-2.5 text-xs text-red-700 dark:text-red-300"
                role="alert"
              >
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span>{localError ?? error}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold" htmlFor="template-file-name">
                文件名 / 保存路径
              </label>
              <Button
                disabled={isBusy || localBusy}
                onClick={() => void chooseSource()}
                size="compact"
                type="button"
                variant="outline"
              >
                <Upload className="size-3.5" />
                导入源码文件
              </Button>
            </div>
            <input
              autoFocus
              className="mt-2 h-10 rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
              id="template-file-name"
              maxLength={160}
              onChange={event => setFileName(event.target.value)}
              placeholder="例如 图论/最短路/dijkstra.cpp"
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

            {classification && (
              <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
                <div className="flex items-center gap-2 font-medium text-primary">
                  <Sparkles className="size-3.5" />
                  {classification.providerName} · {classification.model} 的分类建议
                </div>
                <p className="mt-2 text-muted-foreground">
                  标签：{classification.metadata.tags.join('、') || '未识别'} · 时间复杂度：
                  {classification.metadata.timeComplexity ?? '未知'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  保存前可修改路径；元数据会在创建后显示在算法卡片中。
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] text-muted-foreground">
                  支持工作区内子目录，文件上限 2 MiB。
                </p>
                <Button
                  className="mt-2"
                  disabled={isBusy || localBusy || !fileName.trim() || !content.trim()}
                  onClick={() => void classify()}
                  size="compact"
                  type="button"
                  variant="ghost"
                >
                  {localBusy ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  AI 分类并补全元数据
                </Button>
              </div>
              <div className="flex gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="outline">
                    取消
                  </Button>
                </Dialog.Close>
                <Button disabled={isBusy || localBusy || !fileName.trim()} type="submit">
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
