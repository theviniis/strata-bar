import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Gpu, type GpuProps } from './Gpu'
import { gpuFixture, GPU_FIXTURE_TIME } from './fixtures'
import type { SystemEvent } from '@/services/system/bridge'
import type { WidgetView } from '@/components/status-bar/presentation'
import { isGpuMetricStale } from './presentation'

export function GpuController() {
  const view = useWidgetView()
  const reading = useResourceChannel('gpu', view.intervalMs)
  return (
    <GpuPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}

/** Adapts studio scalars without connecting a native resource channel. */
export function DemoGpuController({
  event,
  view
}: {
  event: SystemEvent<number>
  view: WidgetView
}) {
  const data = gpuFixture()
  const reading =
    event.status === 'ready'
      ? {
          ...event,
          data: { ...data, percent: { ...data.percent, value: event.data } }
        }
      : event
  return (
    <GpuPopupTrigger
      event={reading}
      lastData={undefined}
      now={GPU_FIXTURE_TIME}
      view={view}
    />
  )
}

function GpuPopupTrigger({
  event,
  lastData,
  now,
  view
}: Pick<GpuProps, 'event' | 'lastData' | 'now'> & { view: WidgetView }) {
  const data = event.status === 'ready' ? event.data : lastData
  const stale = isGpuMetricStale(data?.percent, now, event.status === 'ready')
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
