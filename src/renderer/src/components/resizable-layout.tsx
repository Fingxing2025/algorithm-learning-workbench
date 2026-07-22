import {
  type CSSProperties,
  Children,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useLayoutPreference } from '@/hooks/use-layout-preference'
import { cn } from '@/lib/utils'

interface ResizableLayoutProps {
  children: ReactNode
  className?: string
  compactPrimarySize?: number
  defaultPrimarySize: number
  forceCompact?: boolean
  maximumPrimarySize: number
  minimumPrimarySize: number
  minimumSecondarySize: number
  primaryLabel: string
  secondaryLabel: string
  separatorLabel: string
  storageKey: string
  valueText: (size: number) => string
}

const HANDLE_SIZE = 8

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function ResizableLayout({
  children,
  className,
  compactPrimarySize = 76,
  defaultPrimarySize,
  forceCompact = false,
  maximumPrimarySize,
  minimumPrimarySize,
  minimumSecondarySize,
  primaryLabel,
  secondaryLabel,
  separatorLabel,
  storageKey,
  valueText,
}: ResizableLayoutProps) {
  const [primary, secondary] = Children.toArray(children)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startClientX: number; startSize: number } | null>(
    null,
  )
  const primaryId = useId()
  const secondaryId = useId()
  const [containerWidth, setContainerWidth] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const { reset, setSize, size } = useLayoutPreference({
    defaultSize: defaultPrimarySize,
    maximumSize: maximumPrimarySize,
    minimumSize: minimumPrimarySize,
    storageKey,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const updateWidth = () => {
      const width = container.getBoundingClientRect().width
      if (width > 0) setContainerWidth(width)
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  const effectiveMaximum = useMemo(() => {
    if (containerWidth === null) return maximumPrimarySize
    return Math.max(
      Math.min(minimumPrimarySize, containerWidth - HANDLE_SIZE),
      Math.min(maximumPrimarySize, containerWidth - minimumSecondarySize - HANDLE_SIZE),
    )
  }, [containerWidth, maximumPrimarySize, minimumPrimarySize, minimumSecondarySize])
  const effectiveMinimum = Math.min(minimumPrimarySize, effectiveMaximum)
  const renderedSize = forceCompact
    ? compactPrimarySize
    : clamp(size, effectiveMinimum, effectiveMaximum)

  const updateSize = (nextSize: number) => {
    setSize(clamp(nextSize, effectiveMinimum, effectiveMaximum))
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8
    if (event.key === 'ArrowLeft') updateSize(renderedSize - step)
    else if (event.key === 'ArrowRight') updateSize(renderedSize + step)
    else if (event.key === 'Home') updateSize(effectiveMinimum)
    else if (event.key === 'End') updateSize(effectiveMaximum)
    else if (event.key === 'Enter' || event.key === ' ') reset()
    else return
    event.preventDefault()
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startSize: renderedSize,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    setIsDragging(true)
    event.preventDefault()
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    updateSize(drag.startSize + event.clientX - drag.startClientX)
  }

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const style = {
    gridTemplateColumns: forceCompact
      ? `${compactPrimarySize}px minmax(0, 1fr)`
      : `${renderedSize}px ${HANDLE_SIZE}px minmax(0, 1fr)`,
  } satisfies CSSProperties

  return (
    <div
      className={cn(
        'grid h-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)] overflow-hidden',
        isDragging && 'select-none',
        className,
      )}
      data-layout-id={storageKey}
      data-layout-size={renderedSize}
      ref={containerRef}
      style={style}
    >
      <div
        aria-label={primaryLabel}
        className="h-full min-h-0 min-w-0 overflow-hidden"
        id={primaryId}
      >
        {primary}
      </div>
      {!forceCompact && (
        <div
          aria-controls={`${primaryId} ${secondaryId}`}
          aria-label={separatorLabel}
          aria-orientation="vertical"
          aria-valuemax={Math.round(effectiveMaximum)}
          aria-valuemin={Math.round(effectiveMinimum)}
          aria-valuenow={Math.round(renderedSize)}
          aria-valuetext={valueText(Math.round(renderedSize))}
          className="group relative z-20 flex h-full w-2 touch-none cursor-col-resize items-center justify-center bg-background/35 outline-none transition-colors hover:bg-primary/8 focus-visible:bg-primary/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          data-layout-separator={storageKey}
          onDoubleClick={reset}
          onKeyDown={handleKeyDown}
          onLostPointerCapture={finishPointerDrag}
          onPointerCancel={finishPointerDrag}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointerDrag}
          role="separator"
          tabIndex={0}
        >
          <span
            aria-hidden="true"
            className="h-12 w-px rounded-full bg-border-strong transition-all group-hover:w-0.5 group-hover:bg-primary group-focus-visible:w-0.5 group-focus-visible:bg-primary"
          />
        </div>
      )}
      <div
        aria-label={secondaryLabel}
        className="h-full min-h-0 min-w-0 overflow-hidden"
        id={secondaryId}
      >
        {secondary}
      </div>
    </div>
  )
}
