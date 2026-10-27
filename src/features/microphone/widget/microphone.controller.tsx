import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { useConfig } from '@/stores/config'
import { Slot } from '@radix-ui/react-slot'
import { Microphone } from './microphone.widget'
export function MicrophoneController() {
  const view = useWidgetView()
  const event = useSystemChannel('microphone', 0, view.intervalMs)
  return <MicrophonePopupTrigger event={event} view={view} />
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
