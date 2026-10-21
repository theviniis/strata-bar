import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { bridge } from '../../services/system/bridge'
import { useWidgetView } from '../../components/status-bar/widget-view'
import { showLabel } from '../../components/status-bar/presentation'
import { WidgetItemLabel } from '../../components/widget-item'
import { Workspaces } from './Workspaces'

export function Komorebi() {
  const view = useWidgetView()
  const value = useSystemChannel('komorebi', 0, view.intervalMs)
  const snapshot = value.status === 'ready' ? value.data : null
  const offline = value.status === 'unavailable' || value.status === 'error'
  const text =
    value.status === 'error'
      ? value.error
      : 'Áreas de trabalho do komorebi · clique para focar'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <div className="flex min-w-0 items-center gap-2" {...tip.trigger}>
      {showLabel(view.format) && (
        <WidgetItemLabel className="shrink-0 text-[10px]">
          Áreas
        </WidgetItemLabel>
      )}
      {value.status === 'loading' ? (
        <output aria-label="Áreas de trabalho">…</output>
      ) : (
        <Workspaces
          workspaces={snapshot?.workspaces ?? []}
          offline={offline}
          describedBy={view.tooltip ? tip.describedBy : undefined}
          onSelect={(workspace) =>
            bridge
              .komorebiAction?.({
                action: 'focusWorkspace',
                monitor: snapshot?.monitor ?? 0,
                workspace
              })
              .catch((e) =>
                console.error('Não foi possível focar a área de trabalho', e)
              )
          }
        />
      )}
      {view.tooltip && (
        <span id={tip.describedBy} role="tooltip" className="sr-only">
          {text}
        </span>
      )}
    </div>
  )
}
