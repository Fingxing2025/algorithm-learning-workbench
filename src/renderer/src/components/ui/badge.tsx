import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: 'accent' | 'neutral' | 'success' | 'warning'
}

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold tracking-wide',
        tone === 'accent' &&
          'border-primary/22 bg-gradient-to-r from-primary/13 to-accent-blue/10 text-primary',
        tone === 'neutral' && 'border-border bg-muted text-muted-foreground',
        tone === 'success' &&
          'border-success/22 bg-gradient-to-r from-success/13 to-accent-cyan/9 text-success',
        tone === 'warning' &&
          'border-warning/25 bg-gradient-to-r from-warning/14 to-accent-coral/9 text-warning',
        className,
      )}
      {...props}
    />
  )
}
