import type { Reminder } from '@/services/system/reminders.generated'
import type { RemindersPopupProps } from './reminders.popup'

export const REMINDER_FIXTURE_TIME = 1792742400000

export function reminderFixture(): Reminder {
  return {
    id: 'story-reminder',
    message: 'Revisar o projeto',
    mode: { type: 'duration', seconds: 300 },
    originalAt: REMINDER_FIXTURE_TIME + 300000,
    notifyAt: REMINDER_FIXTURE_TIME + 300000,
    eventDurationSeconds: 300,
    status: 'scheduled',
    createdAt: REMINDER_FIXTURE_TIME,
    updatedAt: REMINDER_FIXTURE_TIME,
    googleEventId: null,
    calendarRequested: false,
    calendarError: null
  }
}

const noop = () => {}
const field = <N extends 'duration' | 'time' | 'eventDuration'>(name: N) => ({
  name,
  onChange: async () => {},
  onBlur: async () => {},
  ref: noop
})

export function remindersPopupFixture(): RemindersPopupProps {
  return {
    id: 'reminders-story',
    source: 'demo',
    connected: false,
    mode: 'duration',
    duration: '00:05',
    time: '09:00',
    eventDuration: '30',
    date: new Date(REMINDER_FIXTURE_TIME),
    syncCalendar: false,
    pending: false,
    isSubmitting: false,
    loaded: true,
    visibleError: null,
    success: '',
    errors: {},
    fields: {
      duration: field('duration'),
      time: field('time'),
      eventDuration: field('eventDuration')
    },
    editor: null,
    activeReminders: null,
    dateOpen: false,
    calendarSide: 'bottom',
    onModeChange: noop,
    onSubmit: (event) => event.preventDefault(),
    onFormKeyDown: noop,
    onDurationPointerDown: noop,
    onDurationFocus: noop,
    onDurationPointerUp: noop,
    onDurationChange: noop,
    onAddMinutes: noop,
    onDateChange: noop,
    onQuickDate: noop,
    onDateOpenChange: noop,
    onSyncCalendarChange: noop
  }
}
