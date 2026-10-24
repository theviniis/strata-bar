import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import type { WidgetView } from '@/components/status-bar/presentation'
import { voicemeeterLabel } from '@/services/configuration/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Volume } from './Volume'
export function VolumeController() {
  const view = useWidgetView()
  const event = useSystemChannel('volume', 0, view.intervalMs)
  return <VolumePopupTrigger event={event} view={view} />
}
export function DemoVolumeController({
  event,
  view
}: {
  event: SystemEvent<number>
  view: WidgetView
}) {
  const adapted: SystemEvent<ChannelData['volume']> =
    event.status === 'ready'
      ? { ...event, data: { level: event.data, muted: false } }
      : event
  return <VolumePopupTrigger event={adapted} view={view} />
}
function VolumePopupTrigger({
  event: value,
  view
}: {
  event: SystemEvent<ChannelData['volume']>
  view: WidgetView
}) {
  const audio = view.audio
  const source =
    audio?.source === 'voicemeeter' && audio.enabled !== false
      ? `Voicemeeter: ${voicemeeterLabel(audio)}`
      : 'Volume do dispositivo padrão'
  const text =
    value.status === 'error'
      ? value.error
      : value.status === 'unavailable'
        ? `${source} indisponível`
        : source
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="audioOutputs">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Volume
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
