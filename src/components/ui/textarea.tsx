import * as React from 'react'

import { cn } from '@/lib/utils'
import { useFocusBorder } from './use-focus-border'

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<'textarea'>
>(({ className, onFocus, onBlur, ...props }, ref) => {
  const focusBorder = useFocusBorder<HTMLTextAreaElement>(onFocus, onBlur)
  return (
    <textarea
      className={cn(
        'flex min-h-15 w-full rounded-md border border-border/50 bg-muted/30 glass-surface px-3 py-2 text-body shadow-sm shadow-foreground/5 placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-body',
        className
      )}
      ref={ref}
      {...props}
      {...focusBorder}
    />
  )
})
Textarea.displayName = 'Textarea'

export { Textarea }
