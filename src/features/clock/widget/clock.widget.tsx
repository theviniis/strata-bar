import {
  WidgetItem,
  WidgetItemLabel,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import type { TimePresentation } from '../src/presentation'

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
      <WidgetItemOutput asChild>
        <time dateTime={time.dateTime}>{time.hours}</time>
      </WidgetItemOutput>
      {showDate && <WidgetItemLabel>{time.date}</WidgetItemLabel>}
    </WidgetItem>
  )
}
