import * as Primitive from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/utils'

export const Popover = Primitive.Root
export const PopoverTrigger = Primitive.Trigger

export function PopoverContent({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={cn(
          'z-50 max-w-70 rounded-lg border border-border/50 bg-popover/80 p-4 text-body text-popover-foreground glass-surface shadow-sm shadow-foreground/5',
          className
        )}
        sideOffset={12}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
