import {
  WidgetItem,
  WidgetItemLabel,
  WidgetItemTooltip
} from '@/components/widget-item'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useTime } from './useTime'

export interface ClockProps {
  showDate?: boolean
}

export function Clock({ showDate = false }: ClockProps) {
  const { text, dateTime, hours, date } = useTime()
  const tip = useOverlayTooltip(text)

  return (
    <WidgetPopup.Root popup="clock">
      <WidgetPopup.Anchor asChild>
        <div>
          <WidgetPopup.Trigger asChild>
            <WidgetItem
              type="button"
              aria-label="Abrir calendário"
              aria-describedby={tip.describedBy}
              {...tip.trigger}
            >
              <time dateTime={dateTime}>
                <WidgetItemLabel className="font-semibold text-foreground">
                  {hours}
                </WidgetItemLabel>
              </time>

              {showDate && (
                <span className="text-[10px] text-subtext">{date}</span>
              )}

              <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
