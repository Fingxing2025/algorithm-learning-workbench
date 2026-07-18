import * as Dialog from '@radix-ui/react-dialog'
import { AlertCircle, ImageIcon, Maximize2, Minimize2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ProblemImage } from '@core/contracts/problem'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

interface ProblemImageCardProps {
  image: ProblemImage
  isBusy: boolean
  onRemove: (imageId: string) => void
}

type ImageState = { status: 'error' } | { status: 'loading' } | { dataUrl: string; status: 'ready' }
type PreviewMode = 'fit-screen' | 'fit-width'

export function ProblemImageCard({ image, isBusy, onRemove }: ProblemImageCardProps) {
  const { t } = useI18n()
  const [confirming, setConfirming] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('fit-width')
  const [state, setState] = useState<ImageState>({ status: 'loading' })
  const previewScrollRef = useRef<HTMLDivElement>(null)
  const previewTriggerRef = useRef<HTMLButtonElement>(null)

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

  useEffect(() => {
    if (!previewOpen) return
    previewScrollRef.current?.scrollTo({ left: 0, top: 0 })
  }, [previewMode, previewOpen])

  const handlePreviewOpenChange = (open: boolean) => {
    if (open) setPreviewMode('fit-width')
    setPreviewOpen(open)
  }

  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-panel">
      <div className="relative grid aspect-video place-items-center overflow-hidden bg-muted/45">
        {state.status === 'loading' && (
          <ImageIcon className="size-5 animate-pulse text-muted-foreground" />
        )}
        {state.status === 'error' && <AlertCircle className="size-5 text-red-500" />}
        {state.status === 'ready' && (
          <button
            aria-label={`${t('预览图片')} ${image.originalName}`}
            className="group/preview relative size-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            onClick={() => handlePreviewOpenChange(true)}
            ref={previewTriggerRef}
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
              {t('确认')}
            </Button>
            <Button
              onClick={() => setConfirming(false)}
              size="compact"
              type="button"
              variant="ghost"
            >
              {t('取消')}
            </Button>
          </div>
        ) : (
          <Button
            aria-label={`${t('移除图片')} ${image.originalName}`}
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
        <Dialog.Root onOpenChange={handlePreviewOpenChange} open={previewOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="dialog-overlay fixed inset-0 z-[80] bg-overlay/85 backdrop-blur-md" />
            <Dialog.Content
              className="fixed inset-4 z-[81] flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#080b12] shadow-2xl outline-none sm:inset-8"
              onCloseAutoFocus={event => {
                event.preventDefault()
                previewTriggerRef.current?.focus()
              }}
            >
              <Dialog.Title className="sr-only">
                {t('预览题目图片：{name}', { name: image.originalName })}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {t('按宽度查看可上下滚动完整长图，也可切换为适合窗口；按 Escape 关闭预览。')}
              </Dialog.Description>
              <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 bg-black/45 px-3 py-2 text-white sm:px-4">
                <p className="min-w-0 flex-1 truncate text-xs" title={image.originalName}>
                  {image.originalName}
                </p>
                <div
                  aria-label={t('图片预览方式')}
                  className="flex shrink-0 items-center gap-1.5"
                  role="group"
                >
                  <Button
                    aria-label={t('按宽度查看')}
                    aria-pressed={previewMode === 'fit-width'}
                    className={cn(
                      'border-white/15 bg-black/35 text-white hover:bg-black/65 hover:text-white',
                      previewMode === 'fit-width' && 'bg-white/15',
                    )}
                    onClick={() => setPreviewMode('fit-width')}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <Maximize2 aria-hidden="true" className="size-3.5" />
                    <span className="hidden md:inline">{t('按宽度查看')}</span>
                  </Button>
                  <Button
                    aria-label={t('适合窗口')}
                    aria-pressed={previewMode === 'fit-screen'}
                    className={cn(
                      'border-white/15 bg-black/35 text-white hover:bg-black/65 hover:text-white',
                      previewMode === 'fit-screen' && 'bg-white/15',
                    )}
                    onClick={() => setPreviewMode('fit-screen')}
                    size="compact"
                    type="button"
                    variant="outline"
                  >
                    <Minimize2 aria-hidden="true" className="size-3.5" />
                    <span className="hidden md:inline">{t('适合窗口')}</span>
                  </Button>
                  <Dialog.Close asChild>
                    <Button
                      aria-label={t('关闭图片预览')}
                      className="border-white/15 bg-black/35 text-white hover:bg-black/65 hover:text-white"
                      size="close"
                      type="button"
                      variant="outline"
                    >
                      <X aria-hidden="true" className="size-4" />
                    </Button>
                  </Dialog.Close>
                </div>
              </header>
              <div
                aria-label={t('题目图片滚动预览')}
                className="relative min-h-0 flex-1 overflow-auto bg-[#080b12] p-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 sm:p-4"
                ref={previewScrollRef}
                role="region"
                tabIndex={0}
              >
                <div
                  className={
                    previewMode === 'fit-screen'
                      ? 'grid place-items-center'
                      : 'mx-auto w-full max-w-[1200px]'
                  }
                >
                  <img
                    alt={image.originalName}
                    className={
                      previewMode === 'fit-screen'
                        ? 'block h-auto w-auto object-contain'
                        : 'block h-auto w-full max-w-none'
                    }
                    data-preview-mode={previewMode}
                    src={state.dataUrl}
                    style={
                      previewMode === 'fit-screen'
                        ? {
                            maxHeight: 'calc(100vh - 9rem)',
                            maxWidth: 'calc(100vw - 6rem)',
                          }
                        : undefined
                    }
                  />
                </div>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </article>
  )
}
