import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useResourceChannel } from '@/hooks/use-resource-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import { Slot } from '@radix-ui/react-slot'
import { isGpuMetricStale } from '../src/presentation'
import { Gpu, type GpuProps } from './gpu.widget'

export function GpuController() {
  const view = useWidgetView()
  const reading = useResourceChannel('gpu', view.intervalMs)
  return (
    <GpuPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}

function GpuPopupTrigger({
  event,
  lastData,
  now,
  view
}: Pick<GpuProps, 'event' | 'lastData' | 'now'> & { view: WidgetView }) {
  const data = event.status === 'ready' ? event.data : lastData
  const stale =
    (view.showUsage !== false &&
      isGpuMetricStale(data?.percent, now, event.status === 'ready')) ||
    (view.showTemperature === true &&
      isGpuMetricStale(data?.temperatureCelsius, now, event.status === 'ready'))
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de GPU desatualizada ou indisponível'
        : 'Detalhes da GPU'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="gpu">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Gpu
            event={event}
            now={now}
            lastData={lastData}
            format={view.format}
            showUsage={view.showUsage}
            showTemperature={view.showTemperature}
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
