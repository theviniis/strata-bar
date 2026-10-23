import { ActiveReminders, ActiveRemindersItem } from './ActiveReminders'
import type { Reminder } from '@/services/system/reminders.generated'
import { useReminders } from '@/stores/reminders'
import { memo, useCallback, useMemo, useState } from 'react'
import { ReminderAlertActionsController } from './ReminderAlertActionsController'
import { ReminderMessageController } from './ReminderMessageController'

export const ActiveRemindersController = memo(
  function ActiveRemindersController({
    connected,
    pending,
    onPendingChange
  }: {
    connected: boolean
    pending: boolean
    onPendingChange: (pending: boolean) => void
  }) {
    const reminders = useReminders((state) => state.snapshot?.reminders)
    const dismiss = useReminders((state) => state.dismiss)
    const sync = useReminders((state) => state.syncCalendar)
    const [isOpen, setIsOpen] = useState(false)

    const active = useMemo(
      () =>
        (reminders ?? [])
          .filter((reminder) => reminder.status !== 'dismissed')
          .sort((a, b) => a.notifyAt - b.notifyAt),
      [reminders]
    )

    const onDismiss = useCallback(
      (r: Reminder) => {
        onPendingChange(true)
        void dismiss(r.id).finally(() => onPendingChange(false))
      },
      [dismiss, onPendingChange]
    )

    const onSync = useCallback(
      (r: Reminder) => {
        onPendingChange(true)
        void sync(r.id).finally(() => onPendingChange(false))
      },
      [sync, onPendingChange]
    )

    return (
      <ActiveReminders
        activeCount={active.length}
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        items={active.map((reminder) => (
          <ActiveRemindersItem
            key={reminder.id}
            reminder={reminder}
            pending={pending}
            connected={connected}
            onSync={onSync}
            onDismiss={onDismiss}
            message={<ReminderMessageController message={reminder.message} />}
            actions={<ReminderAlertActionsController id={reminder.id} />}
          />
        ))}
      />
    )
  }
)
