import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet
} from '@/components/ui/field'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

/** Page sizing lives here; the layout editor keeps its available workspace. */
export function SettingsContent({
  width,
  children
}: {
  width: 'form' | 'wide' | 'layout'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full min-w-0 flex-col gap-6 p-4 sm:p-6',
        width === 'form' && 'max-w-4xl',
        width === 'wide' && 'max-w-5xl'
      )}
    >
      {children}
    </div>
  )
}

export function SettingsPage({
  title,
  description,
  children
}: {
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </header>
      {children}
    </div>
  )
}

/** Flat form grouping, including inside the widget settings surface. */
export function SettingsSection({
  title,
  description,
  children,
  wide = false
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <FieldSet className="min-w-0">
      <FieldLegend>
        <h3 className="text-title">{title}</h3>
      </FieldLegend>
      {description && <FieldDescription>{description}</FieldDescription>}
      <FieldGroup className={cn('min-w-0', !wide && 'max-w-xl')}>
        {children}
      </FieldGroup>
    </FieldSet>
  )
}
