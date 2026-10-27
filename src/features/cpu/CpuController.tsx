import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Cpu, type CpuProps } from './Cpu'
import type { WidgetView } from '@/components/status-bar/presentation'
import { isCpuMetricStale } from './presentation'

export function CpuController() {
  const view = useWidgetView()
  const reading = useResourceChannel('cpu', view.intervalMs)
  return (
    <CpuPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}

function CpuPopupTrigger({
  event,
  lastData,
  now,
  view
}: Pick<CpuProps, 'event' | 'lastData' | 'now'> & { view: WidgetView }) {
  const data = event.status === 'ready' ? event.data : lastData
  const stale = isCpuMetricStale(data?.percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de CPU desatualizada ou indisponível'
        : 'Detalhes da CPU'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="cpu">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Cpu
            event={event}
            now={now}
            lastData={lastData}
            format={view.format}
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
