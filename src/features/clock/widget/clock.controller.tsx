import {
  showLabel,
  type WidgetView
} from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { WidgetPopup } from '@/popups/widget-popup'
import { Slot } from '@radix-ui/react-slot'
import type { TimePresentation } from '../src/presentation'
import { useTime } from '../src/use-time'
import { Clock } from './clock.widget'

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
