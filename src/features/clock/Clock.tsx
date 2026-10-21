import {
  WidgetItem,
  WidgetItemLabel,
  WidgetItemTooltip
} from '@/components/widget-item'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useWidgetView } from '../../components/status-bar/widget-view'
import { showLabel } from '../../components/status-bar/presentation'
import { useTime } from './useTime'

export interface ClockProps {
  /** Overrides the configured format; the native bar passes the widget's own. */
  showDate?: boolean
}

export function Clock({ showDate }: ClockProps) {
  const view = useWidgetView()
  const { text, dateTime, hours, date } = useTime()
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  // `label` keeps the date beside the time; `compact` drops it.
  const withDate = showDate ?? showLabel(view.format)

  return (
    <WidgetPopup.Root popup="clock">
      <WidgetPopup.Anchor asChild>
        <div>
          <WidgetPopup.Trigger asChild>
            <WidgetItem
              type="button"
              aria-label="Abrir calendário"
              aria-describedby={view.tooltip ? tip.describedBy : undefined}
              {...tip.trigger}
            >
              <time dateTime={dateTime}>
                <WidgetItemLabel className="font-semibold text-foreground">
                  {hours}
                </WidgetItemLabel>
              </time>

              {withDate && (
                <span className="text-[10px] text-muted-foreground">
                  {date}
                </span>
              )}

              {view.tooltip && (
                <WidgetItemTooltip id={tip.describedBy}>
                  {text}
                </WidgetItemTooltip>
              )}
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
