import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import {
  bridge,
  type KomorebiData,
  type SystemEvent
} from '@/services/system/bridge'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import type { WidgetView } from '@/components/status-bar/presentation'
import { Komorebi } from './Komorebi'
import { useWorkspaceIndicator } from './useWorkspaceIndicator'

export function KomorebiController() {
  const view = useWidgetView()
  const preview = useWidgetPreview()
  const event = useSystemChannel('komorebi', 0, view.intervalMs)
  return (
    <KomorebiComposition
      event={event}
      view={view}
      inert={preview}
      showTitles={bridge.mode === 'demo'}
    />
  )
}

export function DemoKomorebiController({
  event,
  view,
  inert
}: {
  event: SystemEvent<KomorebiData>
  view: WidgetView
  inert: boolean
}) {
  return (
    <KomorebiComposition event={event} view={view} inert={inert} showTitles />
  )
}

function KomorebiComposition({
  event,
  view,
  inert,
  showTitles
}: {
  event: SystemEvent<KomorebiData>
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
      : 'Áreas de trabalho do komorebi · clique para focar'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  const onSelect = (workspace: number) => {
    if (inert || !snapshot) return
    bridge
      .komorebiAction?.({
        action: 'focusWorkspace',
        monitor: snapshot.monitor,
        workspace
      })
      .catch((error) =>
        console.error('Não foi possível focar a área de trabalho', error)
      )
  }
  return (
    <>
      <Komorebi
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
