import type { WidgetView } from '@/components/status-bar/presentation'
import { showLabel } from '@/components/status-bar/presentation'
import { WidgetItemLabel } from '@/components/widget-item'
import type { WorkspacesData, SystemEvent } from '@/services/system/bridge'
import type { ComponentProps } from 'react'
import { Workspaces, type WorkspacesProps } from './Workspaces'

export interface WorkspacesWidgetProps extends ComponentProps<'div'> {
  event: SystemEvent<WorkspacesData>
  format: WidgetView['format']
  workspaceProps: Omit<WorkspacesProps, 'workspaces' | 'offline'>
}

export function WorkspacesWidget({
  event,
  format,
  workspaceProps,
  ...props
}: WorkspacesWidgetProps) {
  const snapshot = event.status === 'ready' ? event.data : null
  const active = snapshot?.workspaces.find(
    (workspace) => workspace.status === 'active'
  )
  const label = active ? active.name?.trim() || `Área ${active.index + 1}` : '—'
  return (
    <div className="flex min-w-0 items-center gap-2 px-2" {...props}>
      {showLabel(format) && (
        <WidgetItemLabel className="shrink-0 text-micro">
          {label}
        </WidgetItemLabel>
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
