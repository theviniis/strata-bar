import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import {
  bridge,
  type WorkspacesData,
  type SystemEvent
} from '@/services/system/bridge'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import type { WidgetView } from '@/components/status-bar/presentation'
import { WorkspacesWidget } from './WorkspacesWidget'
import { useWorkspaceIndicator } from './useWorkspaceIndicator'

export function WorkspacesController() {
  const view = useWidgetView()
  const preview = useWidgetPreview()
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
      inert={preview}
      showTitles={bridge.mode === 'demo'}
    />
  )
}

export function DemoWorkspacesController({
  event,
  view,
  inert
}: {
  event: SystemEvent<WorkspacesData>
  view: WidgetView
  inert: boolean
}) {
  return (
    <WorkspacesComposition event={event} view={view} inert={inert} showTitles />
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
  const refs = useWorkspaceIndicator(activeIndex, offline)
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
