import { ReminderAlertActions } from './ReminderAlertActions'
import { type SnoozeOption } from '@/services/system/reminders'
import { useReminders } from '@/stores/reminders'
import { useId, useState } from 'react'

export function ReminderAlertActionsController({
  id,
  onDone
}: {
  id: string
  onDone?: () => void
}) {
  const inputId = useId()
  const dismiss = useReminders((s) => s.dismiss)
  const snooze = useReminders((s) => s.snooze)
  const error = useReminders((s) => s.error)
  const [option, setOption] = useState<SnoozeOption>('5')
  const [pending, setPending] = useState(false)
  async function act(shouldSnooze: boolean) {
    if (pending) return
    setPending(true)
    try {
      const ok = await (shouldSnooze ? snooze(id, option) : dismiss(id))
      if (ok) onDone?.()
    } finally {
      setPending(false)
    }
  }
  return (
    <ReminderAlertActions
      inputId={inputId}
      option={option}
      pending={pending}
      error={error}
      onOptionChange={setOption}
      onSnooze={() => void act(true)}
      onDismiss={() => void act(false)}
    />
  )
}
