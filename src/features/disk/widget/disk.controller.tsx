import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { Slot } from '@radix-ui/react-slot'
import { describeDisks, isDiskStale, localVolumes } from '../src/presentation'
import { Disk, type DiskProps } from './disk.widget'
export function DiskController() {
  const view = useWidgetView()
  const reading = useResourceChannel('disk', view.intervalMs)
  return (
    <DiskPopupTrigger {...reading} lastData={reading.lastData} view={view} />
  )
}
function DiskPopupTrigger({
  event,
  lastData,
  now,
  view
}: Pick<DiskProps, 'event' | 'lastData' | 'now'> & { view: WidgetView }) {
  const data = event.status === 'ready' ? event.data : lastData
  const text =
    event.status === 'error'
      ? event.error
      : data && isDiskStale(data, now, event.status === 'ready')
        ? 'Leitura dos discos desatualizada'
        : describeDisks(localVolumes(data?.volumes ?? []))
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="disk">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Disk
            event={event}
            lastData={lastData}
            now={now}
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
