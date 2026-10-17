import * as Primitive from '@radix-ui/react-popover'
import type { ComponentPropsWithoutRef } from 'react'

export const Popover = Primitive.Root
export const PopoverTrigger = Primitive.Trigger

export function PopoverContent({
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content className="popover" sideOffset={12} {...props}>
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
