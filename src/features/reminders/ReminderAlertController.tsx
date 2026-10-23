import { ReminderAlert } from './ReminderAlert'
import { useEffect } from 'react'
import { usePopupContext } from '@/popups/context'
import { useReminders } from '@/stores/reminders'
import { ReminderMessageController } from './ReminderMessageController'
import { ReminderAlertActionsController } from './ReminderAlertActionsController'

export function ReminderAlertController() {
  const { params, close } = usePopupContext('reminderAlert')
  const snapshot = useReminders((s) => s.snapshot)
  const reminder = snapshot?.reminders.find((r) => r.id === params.id)
  const synchronized =
    snapshot !== null && snapshot.revision >= (params.revision ?? 0)
  const error = useReminders((s) => s.error)
  const source = useReminders((s) => s.source)
  useEffect(() => {
    if (synchronized && (!reminder || reminder.status !== 'ringing')) close()
  }, [synchronized, reminder, close])
  return (
    <ReminderAlert
      synchronized={synchronized}
      reminder={reminder}
      error={error}
      source={source}
      close={close}
      message={
        reminder ? (
          <ReminderMessageController message={reminder.message} />
        ) : null
      }
      actions={
        reminder ? (
          <ReminderAlertActionsController id={reminder.id} onDone={close} />
        ) : null
      }
    />
  )
}
