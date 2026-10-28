import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'
import {
  WidgetItemIcon,
  WidgetItemOutput,
  type WidgetItemIconProps,
  type WidgetItemOutputProps
} from './widget-item'

function Root({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'py-2 px-4 bg-muted/20 rounded grid gap-2 spacing-y-2',
        className
      )}
      {...props}
    />
  )
}

function Header({ className, ...props }: ComponentProps<'p'>) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-1 text-body',
        className
      )}
      {...props}
    />
  )
}

function Title({ className, ...props }: ComponentProps<'h3'>) {
  return (
    <h3
      className={cn('uppercase text-foreground flex gap-1', className)}
      {...props}
    />
  )
}

function Description({ className, ...props }: ComponentProps<'p'>) {
  return <p className={cn('text-muted-foreground', className)} {...props} />
}

function Output({
  className,
  children,
  error,
  ...props
}: WidgetItemOutputProps & { error?: string | null }) {
  return (
    <div className="flex flex-col gap-1 col-span-2">
      <WidgetItemOutput
        {...props}
        title={error ?? undefined}
        className={cn(
          'text-2xl justify-center col-span-2 font-light leading-none tracking-tight text-foreground tabular-nums',
          className
        )}
      >
        {children}
      </WidgetItemOutput>
      {error && (
        <p className="text-micro text-destructive wrap-break-word">{error}</p>
      )}
    </div>
  )
}

function Icon({ className, size = 14, ...props }: WidgetItemIconProps) {
  return (
    <WidgetItemIcon
      size={size}
      className={cn('text-inherit', className)}
      aria-hidden
      {...props}
    />
  )
}

export const BigNumbers = { Root, Icon, Title, Description, Output, Header }
