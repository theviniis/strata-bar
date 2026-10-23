import { Slot } from '@radix-ui/react-slot'
import { WidgetItemTooltip } from '@/components/widget-item'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useWidgetView } from '@/components/status-bar/widget-view'
import {
  showLabel,
  type WidgetView
} from '@/components/status-bar/presentation'
import { Clock } from './Clock'
import { useTime } from './useTime'
import type { TimePresentation } from './presentation'

export function ClockController({ showDate }: { showDate?: boolean }) {
  const view = useWidgetView()
  const time = useTime()
  return (
    <ClockTrigger
      time={time}
      view={view}
      showDate={showDate ?? showLabel(view.format)}
    />
  )
}
export function DemoClockController({
  view,
  staticPreview = false
}: {
  view: WidgetView
  staticPreview?: boolean
}) {
  const time = useTime(staticPreview)
  return (
    <ClockTrigger time={time} view={view} showDate={showLabel(view.format)} />
  )
}
function ClockTrigger({
  time,
  view,
  showDate
}: {
  time: TimePresentation
  view: WidgetView
  showDate: boolean
}) {
  const tip = useOverlayTooltip(view.tooltip ? time.text : '')
  return (
    <WidgetPopup.Root popup="clock">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Clock
            time={time}
            showDate={showDate}
            describedBy={view.tooltip ? tip.describedBy : undefined}
          />
        </Slot>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{time.text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
