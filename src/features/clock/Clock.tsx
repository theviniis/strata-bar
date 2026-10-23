import {
  WidgetItem,
  WidgetItemLabel,
  type WidgetItemProps
} from '@/components/widget-item'
import type { TimePresentation } from './presentation'

export interface ClockProps extends WidgetItemProps {
  time: Pick<TimePresentation, 'dateTime' | 'hours' | 'date'>
  showDate: boolean
  describedBy: string | undefined
}
export function Clock({
  time,
  showDate,
  describedBy,
  ...triggerProps
}: ClockProps) {
  return (
    <WidgetItem
      type="button"
      aria-label="Abrir calendário"
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <time dateTime={time.dateTime}>
        <WidgetItemLabel className="font-semibold text-foreground">
          {time.hours}
        </WidgetItemLabel>
      </time>
      {showDate && (
        <span className="text-[10px] text-muted-foreground">{time.date}</span>
      )}
    </WidgetItem>
  )
}
