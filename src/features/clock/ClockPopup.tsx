import { Calendar } from '@/components/ui/calendar'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { TimePresentation } from './presentation'

export interface ClockPopupProps {
  time: TimePresentation
  calendarMonth: Date
  selectedDate: Date
  onDateSelect: (date: Date | undefined) => void
}

export function ClockPopup({
  time,
  calendarMonth,
  selectedDate,
  onDateSelect
}: ClockPopupProps) {
  const { now, dateTime, day, year, week, hours, month } = time

  return (
    <div>
      <CardHeader>
        <CardTitle>Calendário</CardTitle>
        <CardDescription>Visualize informações de hora e data</CardDescription>
      </CardHeader>
      <CardContent>
        <section className="grid grid-cols-[auto_auto] place-content-center gap-8">
          <div className="flex flex-col items-center justify-center capitalize">
            <p className="font-bold text-lg">{day}</p>
            <p className="text-base leading-5 text-muted-foreground">
              {month}, {year}
            </p>
            <time
              dateTime={dateTime}
              className="text-[70px] leading-none font-bold tracking-tight tabular-nums"
            >
              {hours}
            </time>
            <span className="mt-3 rounded text-xs focus-visible:outline-2 focus-visible:outline-ring text-muted-foreground">
              Week {week}
            </span>
          </div>
          <Calendar
            mode="single"
            className="bg-transparent p-0"
            selected={selectedDate}
            onSelect={onDateSelect}
            month={calendarMonth}
            today={now}
            readOnly
            hideNavigation
          />
        </section>
      </CardContent>
    </div>
  )
}
