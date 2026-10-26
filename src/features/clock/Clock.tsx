import {
  WidgetItem,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import { cn } from '@/lib/utils'
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
  className,
  ...triggerProps
}: ClockProps) {
  return (
    <WidgetItem
      type="button"
      aria-label="Abrir calendário"
      aria-describedby={describedBy}
      {...triggerProps}
      className={cn('items-end', className)}
    >
      <time dateTime={time.dateTime}>
        <WidgetItemOutput>{time.hours}</WidgetItemOutput>
      </time>
      {showDate && (
        <span className="text-micro text-muted-foreground">{time.date}</span>
      )}
    </WidgetItem>
  )
}
