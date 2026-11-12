import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { Slot } from '@radix-ui/react-slot'
import { VoicemeeterMidiStatus } from './voicemeeter-midi-status.widget'

export function VoicemeeterMidiStatusController() {
  const view = useWidgetView()
  const event = useSystemChannel('voicemeeterMidi', 0, view.intervalMs)
  return <VoicemeeterMidiStatusPopupTrigger event={event} view={view} />
}

function VoicemeeterMidiStatusPopupTrigger({
  event: value,
  view
}: {
  event: SystemEvent<ChannelData['voicemeeterMidi']>
  view: WidgetView
}) {
  const text =
    value.status === 'ready' && value.data
      ? value.data.status === 'connected'
        ? `MIDI: ${value.data.deviceName} (Conectado)`
        : value.data.status === 'disconnected'
          ? `MIDI: ${value.data.deviceName} (Desconectado)`
          : value.data.status === 'checking'
            ? 'MIDI: Verificando...'
            : 'MIDI: Indisponível'
      : value.status === 'error'
        ? value.error
        : value.status === 'unavailable'
          ? 'MIDI indisponível'
          : 'Carregando status MIDI...'

  const tip = useOverlayTooltip(view.tooltip ? text : '')

  return (
    <WidgetPopup.Root popup="voicemeeterMidiStatus">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <VoicemeeterMidiStatus
            event={value}
            describedBy={view.tooltip ? tip.describedBy : undefined}
          />
        </Slot>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
