import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Memory, type MemoryProps } from './Memory'
import type { WidgetView } from '@/components/status-bar/presentation'
import { isMemoryMetricStale } from './presentation'

export function MemoryController() {
  const view = useWidgetView()
  const reading = useResourceChannel('memory', view.intervalMs)
  return (
    <MemoryPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}

function MemoryPopupTrigger({
  event,
  lastData,
  now,
  view
}: Pick<MemoryProps, 'event' | 'lastData' | 'now'> & { view: WidgetView }) {
  const data = event.status === 'ready' ? event.data : lastData
  const stale = isMemoryMetricStale(
    data?.percent,
    now,
    event.status === 'ready'
  )
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de RAM desatualizada ou indisponível'
        : 'Detalhes da memória'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="memory">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Memory
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
