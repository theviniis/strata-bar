import type { WidgetView } from '@/components/status-bar/presentation'
import { showLabel } from '@/components/status-bar/presentation'
import { WidgetItemLabel } from '@/components/widget-item'
import type { KomorebiData, SystemEvent } from '@/services/system/bridge'
import type { ComponentProps } from 'react'
import { Workspaces, type WorkspacesProps } from './Workspaces'

export interface KomorebiProps extends ComponentProps<'div'> {
  event: SystemEvent<KomorebiData>
  format: WidgetView['format']
  workspaceProps: Omit<WorkspacesProps, 'workspaces' | 'offline'>
}

export function Komorebi({
  event,
  format,
  workspaceProps,
  ...props
}: KomorebiProps) {
  const snapshot = event.status === 'ready' ? event.data : null
  return (
    <div className="flex min-w-0 items-center gap-2 px-2" {...props}>
      {showLabel(format) && (
        <WidgetItemLabel className="shrink-0 text-micro">Áreas</WidgetItemLabel>
      )}
      {event.status === 'loading' ? (
        <output aria-label="Áreas de trabalho">…</output>
      ) : (
        <Workspaces
          {...workspaceProps}
          workspaces={snapshot?.workspaces ?? []}
          offline={event.status === 'unavailable' || event.status === 'error'}
        />
      )}
    </div>
  )
}
