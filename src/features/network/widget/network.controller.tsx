import { useConfig } from '@/stores/config'
import { Slot } from '@radix-ui/react-slot'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useResourceChannel } from '@/hooks/use-resource-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import { metric } from '../src/presentation'
import { NetworkWidget } from './network.widget'

export function NetworkController() {
  const view = useWidgetView()
  const { event, now } = useResourceChannel('network')
  const unit = useConfig((s) => s.config.network?.unit ?? 'bytes')
  const data = event.status === 'ready' ? event.data : undefined
  const adapter = data?.interfaces.find((i) => i.id === data.selectedId)
  const quality = data?.quality.error ? undefined : data?.quality
  const text =
    event.status === 'error'
      ? event.error
      : (data?.error ??
        (data && now - data.sampledAt > 6000
          ? 'Leitura de rede desatualizada'
          : `${adapter?.name ?? 'Rede'} · Ping ${metric(quality?.pingMs, 'ms')} · Jitter ${metric(quality?.jitterMs, 'ms')} · Perda ICMP ${metric(quality?.lossPercent, '%')}`))
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="network">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <NetworkWidget
            event={event}
            now={now}
            unit={unit}
            format={view.format}
            direction={view.networkDirection}
            aria-describedby={view.tooltip ? tip.describedBy : undefined}
          />
        </Slot>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
