import { ClockPopup } from './clock.popup'
import { useTime } from '../src/use-time'

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
