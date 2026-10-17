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
      <Primitive.Content
        className="z-50 max-w-[280px] rounded-[8px] border border-[#494052] bg-[#211e2b] p-[16px] text-[12px] text-[#e9e1f7] shadow-[0_8px_28px_#0005]"
        sideOffset={12}
        {...props}
      >
        {children}
      </Primitive.Content>
    </Primitive.Portal>
  )
}
