import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Cpu, type CpuProps } from './Cpu'
import { cpuFixture, CPU_FIXTURE_TIME } from './fixtures'
import type { SystemEvent } from '@/services/system/bridge'
import type { WidgetView } from '@/components/status-bar/presentation'
import { isCpuMetricStale } from './presentation'

export function CpuController() {
  const view = useWidgetView()
  const reading = useResourceChannel('cpu', view.intervalMs)
  return (
    <CpuPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}

/** Adapts studio scalars without connecting a native resource channel. */
export function DemoCpuController({
  event,
  view
}: {
  event: SystemEvent<number>
  view: WidgetView
}) {
  const data = cpuFixture()
  const reading =
    event.status === 'ready'
      ? {
          ...event,
          data: { ...data, percent: { ...data.percent, value: event.data } }
        }
      : event
  return (
    <CpuPopupTrigger
      event={reading}
      lastData={undefined}
      now={CPU_FIXTURE_TIME}
      view={view}
    />
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
