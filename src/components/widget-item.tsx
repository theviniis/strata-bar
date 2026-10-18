import { cn } from '@/lib/utils'
import { Slot } from '@radix-ui/react-slot'
import type { LucideProps } from 'lucide-react'
import type { ComponentProps, ElementType } from 'react'

export interface WidgetItemProps extends ComponentProps<'button'> {
  asChild?: boolean
}

export function WidgetItem({
  className,
  asChild = false,
  ...props
}: WidgetItemProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded focus-visible:outline-accent transition-colors duration-200 hover:bg-muted',
        className
      )}
      {...props}
    />
  )
}

export interface WidgetItemIconProps extends LucideProps {
  icon: ElementType
}

export function WidgetItemIcon({
  icon: Icon,
  className,
  size = 14,
  ...props
}: WidgetItemIconProps) {
  return (
    <Icon size={size} className={cn('text-secondary', className)} {...props} />
  )
}

export interface WidgetItemLabelProps extends ComponentProps<'span'> {
  asChild?: boolean
}

export function WidgetItemLabel({
  className,
  asChild = false,
  ...props
}: WidgetItemLabelProps) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp className={cn('text-[11px] text-foreground', className)} {...props} />
  )
}

export interface WidgetItemOutputProps extends ComponentProps<'output'> {
  asChild?: boolean
}

export function WidgetItemOutput({
  className,
  asChild = false,
  children,
  ...props
}: WidgetItemOutputProps) {
  const Comp = asChild ? Slot : 'output'
  return (
    <Comp className={cn('flex items-center gap-1', className)} {...props}>
      {children}%
    </Comp>
  )
}

export interface WidgetItemTooltipProps extends Omit<
  ComponentProps<'span'>,
  'role'
> {
  asChild?: boolean
}

export function WidgetItemTooltip({
  className,
  asChild = false,
  ...props
}: WidgetItemTooltipProps) {
  const Comp = asChild ? Slot : 'span'
  return (
    <Comp
      className={cn('sr-only w-0 h-0 hidden', className)}
      role="tooltip"
      {...props}
    />
  )
}
