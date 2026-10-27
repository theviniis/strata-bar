import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { useConfig } from '@/stores/config'
import { Slot } from '@radix-ui/react-slot'
import { Volume } from './volume.widget'
export function VolumeController() {
  const view = useWidgetView()
  const event = useSystemChannel('volume', 0, view.intervalMs)
  return <VolumePopupTrigger event={event} view={view} />
}
function VolumePopupTrigger({
  event: value,
  view
}: {
  event: SystemEvent<ChannelData['volume']>
  view: WidgetView
}) {
  const audio = useConfig((state) => state.config.audio.output)
  const source =
    audio.source === 'voicemeeter'
      ? `Voicemeeter: Bus ${audio.targetIndex}`
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
