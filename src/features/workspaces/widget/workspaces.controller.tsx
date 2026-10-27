import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useSystemChannel } from '@/hooks/use-system-channel'
import {
  bridge,
  type SystemEvent,
  type WorkspacesData
} from '@/services/system/bridge'
import { useWorkspaceIndicator } from '../src/use-workspace-indicator'
import { WorkspacesWidget } from './workspaces.widget'

export function WorkspacesController() {
  const view = useWidgetView()
  const runtime = useWidgetRuntime()
  const event = useSystemChannel(
    'workspaces',
    0,
    view.intervalMs,
    view.workspaceSource
  )
  return (
    <WorkspacesComposition
      event={event}
      view={view}
      inert={!runtime.interactive}
      showTitles={bridge.mode === 'demo'}
    />
  )
}

function WorkspacesComposition({
  event,
  view,
  inert,
  showTitles
}: {
  event: SystemEvent<WorkspacesData>
  view: WidgetView
  inert: boolean
  showTitles: boolean
}) {
  const snapshot = event.status === 'ready' ? event.data : null
  const offline = event.status !== 'ready'
  const activeIndex = snapshot?.workspaces.find(
    (workspace) => workspace.status === 'active'
  )?.index
  const refs = useWorkspaceIndicator(activeIndex, offline, !inert)
  const text =
    event.status === 'error'
      ? event.error
      : 'Áreas de trabalho · clique para focar'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  const onSelect = (workspace: number) => {
    if (inert || !snapshot) return
    bridge
      .workspacesAction?.({
        action: 'focusWorkspace',
        source: view.workspaceSource ?? 'windows',
        monitor: snapshot.monitor,
        workspace
      })
      .catch((error) =>
        console.error('Não foi possível focar a área de trabalho', error)
      )
  }
  return (
    <>
      <WorkspacesWidget
        event={event}
        format={view.format}
        {...tip.trigger}
        workspaceProps={{
          ...refs,
          onSelect,
          showTitles,
          describedBy: view.tooltip ? tip.describedBy : undefined
        }}
      />
      {view.tooltip && (
        <span id={tip.describedBy} role="tooltip" className="sr-only">
          {text}
        </span>
      )}
    </>
  )
}
