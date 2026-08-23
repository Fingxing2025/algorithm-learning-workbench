interface LiveRegionProps {
  message: string | null
  politeness?: 'assertive' | 'polite'
  testId?: string
}

export function LiveRegion({ message, politeness = 'polite', testId }: LiveRegionProps) {
  return (
    <div aria-atomic="true" aria-live={politeness} className="sr-only" data-testid={testId}>
      {message ?? ''}
    </div>
  )
}
