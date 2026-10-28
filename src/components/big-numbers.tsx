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
        'glass-surface flex min-w-0 flex-col gap-2 rounded border border-border/50 bg-muted/30 px-4 py-2 shadow-sm shadow-foreground/5',
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
    <div className="flex min-w-0 flex-col gap-1">
      <WidgetItemOutput
        {...props}
        title={error ?? undefined}
        className={cn(
          'text-2xl justify-center font-light leading-none tracking-tight text-foreground tabular-nums',
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
