import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { bridge } from '../../services/system/bridge'
import { Workspaces } from './Workspaces'

export function Komorebi() {
  const value = useSystemChannel('komorebi')
  const snapshot = value.status === 'ready' ? value.data : null
  const offline = value.status === 'unavailable' || value.status === 'error'
  const text =
    value.status === 'error'
      ? value.error
      : 'Áreas de trabalho do komorebi · clique para focar'
  const tip = useOverlayTooltip(text)
  return (
    <div className="flex min-w-0 items-center gap-2" {...tip.trigger}>
      {value.status === 'loading' ? (
        <output aria-label="Áreas de trabalho">…</output>
      ) : (
        <Workspaces
          workspaces={snapshot?.workspaces ?? []}
          offline={offline}
          describedBy={tip.describedBy}
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
      <span id={tip.describedBy} role="tooltip" className="sr-only">
        {text}
      </span>
    </div>
  )
}
