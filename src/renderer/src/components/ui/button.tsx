import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 outline-none active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border border-white/12 bg-gradient-to-br from-primary via-primary to-accent-blue text-primary-foreground shadow-[0_10px_24px_-14px_var(--primary)] hover:-translate-y-0.5 hover:saturate-110 hover:shadow-[0_14px_30px_-14px_var(--primary)]',
        outline:
          'border border-border bg-panel/68 text-foreground shadow-xs backdrop-blur-md hover:-translate-y-0.5 hover:border-border-strong hover:bg-muted/85 hover:text-foreground',
        ghost:
          'text-muted-foreground hover:-translate-y-0.5 hover:bg-muted/80 hover:text-foreground',
        subtle:
          'border border-primary/10 bg-gradient-to-br from-primary/12 to-accent-blue/8 text-primary hover:-translate-y-0.5 hover:from-primary/18 hover:to-accent-blue/12',
      },
      size: {
        default: 'h-9 px-3.5',
        compact: 'h-8 rounded-md px-3 text-xs',
        close:
          'size-11 rounded-lg border border-transparent bg-muted/35 p-0 hover:translate-y-0 hover:border-border hover:bg-muted/80 active:bg-muted',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
  },
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild = false, className, size, variant, ...props }, ref) => {
    const Component = asChild ? Slot : 'button'
    return (
      <Component
        className={cn(buttonVariants({ className, size, variant }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button }
