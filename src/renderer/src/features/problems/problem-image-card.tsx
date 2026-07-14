import { AlertCircle, ImageIcon, Trash2 } from 'lucide-react'
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
      <div className="grid aspect-video place-items-center overflow-hidden bg-muted/45">
        {state.status === 'loading' && (
          <ImageIcon className="size-5 animate-pulse text-muted-foreground" />
        )}
        {state.status === 'error' && <AlertCircle className="size-5 text-red-500" />}
        {state.status === 'ready' && (
          <img
            alt={image.originalName}
            className="size-full object-cover"
            loading="lazy"
            src={state.dataUrl}
          />
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
    </article>
  )
}
