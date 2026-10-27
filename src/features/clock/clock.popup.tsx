import { Calendar } from '@/components/ui/calendar'
import type { TimePresentation } from './presentation'
import { useTime } from './useTime'

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
    <section className="grid grid-cols-[auto_auto] place-content-center gap-8 p-4">
      <div className="flex flex-col items-center justify-center capitalize">
        <p className="text-title">{day}</p>
        <p className="text-body text-muted-foreground">
          {month}, {year}
        </p>
        <time
          dateTime={dateTime}
          className="text-clock-display font-bold tracking-tight tabular-nums"
        >
          {hours}
        </time>
        <span className="mt-3 rounded text-body focus-visible:outline-2 focus-visible:outline-ring text-muted-foreground">
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
  )
}

// The calendar is intentionally read-only; supplying onSelect keeps DayPicker controlled.
const ignoreSelection = () => {}

export function ClockPopupController() {
  const time = useTime()
  return (
    <ClockPopup
      time={time}
      calendarMonth={time.now}
      selectedDate={time.now}
      onDateSelect={ignoreSelection}
    />
  )
}
