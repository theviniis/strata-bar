import * as React from 'react'

import { cn } from '@/lib/utils'
import { useFocusBorder } from './use-focus-border'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, onFocus, onBlur, ...props }, ref) => {
    const focusBorder = useFocusBorder<HTMLInputElement>(onFocus, onBlur)
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-border/50 bg-muted/30 glass-surface px-3 py-1 text-control shadow-sm shadow-foreground/5 file:border-0 file:bg-transparent file:text-control file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-control',
          className
        )}
        ref={ref}
        {...props}
        {...focusBorder}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
