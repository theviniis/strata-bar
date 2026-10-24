import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import type { WidgetView } from '@/components/status-bar/presentation'
import { useConfig } from '@/stores/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Microphone } from './Microphone'
export function MicrophoneController() {
  const view = useWidgetView()
  const event = useSystemChannel('microphone', 0, view.intervalMs)
  return <MicrophonePopupTrigger event={event} view={view} />
}
export function DemoMicrophoneController({
  event,
  view
}: {
  event: SystemEvent<number>
  view: WidgetView
}) {
  const adapted: SystemEvent<ChannelData['microphone']> =
    event.status === 'ready'
      ? { ...event, data: { level: event.data, muted: false } }
      : event
  return <MicrophonePopupTrigger event={adapted} view={view} />
}
function MicrophonePopupTrigger({
  event: value,
  view
}: {
  event: SystemEvent<ChannelData['microphone']>
  view: WidgetView
}) {
  const audio = useConfig((state) => state.config.audio.input)
  const muted = value.status === 'ready' && value.data.muted
  const source =
    audio.source === 'voicemeeter'
      ? `Microfone (Strip ${audio.targetIndex})`
      : 'Microfone'
  const text =
    value.status === 'ready'
      ? `${source}: ${value.data.level}%${muted ? ' (silenciado)' : ''}`
      : value.status === 'error'
        ? value.error
        : value.status === 'unavailable'
          ? `${source} indisponível`
          : `Carregando ${source.toLowerCase()}`
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="audioInputs">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Microphone
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
