import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, ImageIcon, Maximize2, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import type { ProblemImage } from '@core/contracts/problem'

import { Button } from '@/components/ui/button'

interface ProblemImageCardProps {
  image: ProblemImage
  isBusy: boolean
  onRemove: (imageId: string) => void
}

type ImageState = { status: 'error' } | { status: 'loading' } | { dataUrl: string; status: 'ready' }

export function ProblemImageCard({ image, isBusy, onRemove }: ProblemImageCardProps) {
  const [confirming, setConfirming] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [state, setState] = useState<ImageState>({ status: 'loading' })

  useEffect(() => {
    let isActive = true
    setState({ status: 'loading' })
    window.desktop.problems
      .readImage(image.id)
      .then(value => {
        if (isActive) {
          setState({ dataUrl: value.dataUrl, status: 'ready' })
        }
      })
      .catch(() => {
        if (isActive) {
          setState({ status: 'error' })
        }
      })
    return () => {
      isActive = false
    }
  }, [image.id])

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-panel">
      <div className="relative grid aspect-video place-items-center overflow-hidden bg-muted/45">
        {state.status === 'loading' && (
          <ImageIcon className="size-5 animate-pulse text-muted-foreground" />
        )}
        {state.status === 'error' && <AlertCircle className="size-5 text-red-500" />}
        {state.status === 'ready' && (
          <button
            aria-label={`预览图片 ${image.originalName}`}
            className="group/preview relative size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => setPreviewOpen(true)}
            type="button"
          >
            <img
              alt={image.originalName}
              className="size-full object-cover transition-transform duration-200 group-hover/preview:scale-[1.02]"
              loading="lazy"
              src={state.dataUrl}
            />
            <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-lg bg-overlay/65 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100">
              <Maximize2 aria-hidden="true" className="size-3.5" />
            </span>
          </button>
        )}
      </div>
      <div className="flex min-h-12 items-center gap-2 px-3 py-2">
        <p
          className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
          title={image.originalName}
        >
          {image.originalName}
        </p>
        {confirming ? (
          <div className="flex gap-1">
            <Button
              disabled={isBusy}
              onClick={() => onRemove(image.id)}
              size="compact"
              type="button"
              variant="outline"
            >
              确认
            </Button>
            <Button
              onClick={() => setConfirming(false)}
              size="compact"
              type="button"
              variant="ghost"
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            aria-label={`移除图片 ${image.originalName}`}
            disabled={isBusy}
            onClick={() => setConfirming(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
          </Button>
        )}
      </div>
      {state.status === 'ready' && (
        <Dialog.Root onOpenChange={setPreviewOpen} open={previewOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-overlay/85 backdrop-blur-md" />
            <Dialog.Content className="fixed inset-4 z-[81] grid place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#080b12] p-4 shadow-2xl outline-none sm:inset-8">
              <Dialog.Title className="sr-only">预览题目图片：{image.originalName}</Dialog.Title>
              <Dialog.Description className="sr-only">
                放大查看本地保存的题目图片，按 Escape 关闭预览。
              </Dialog.Description>
              <img
                alt={image.originalName}
                className="max-h-full max-w-full object-contain"
                src={state.dataUrl}
              />
              <div className="absolute left-4 top-4 max-w-[calc(100%-5rem)] truncate rounded-lg bg-black/55 px-3 py-2 text-xs text-white backdrop-blur-sm">
                {image.originalName}
              </div>
              <Dialog.Close asChild>
                <Button
                  aria-label="关闭图片预览"
                  className="absolute right-4 top-4 border-white/15 bg-black/55 text-white hover:bg-black/75"
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </article>
  )
}
