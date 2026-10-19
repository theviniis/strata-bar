import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { snoozeOptions, type SnoozeOption } from '@/services/system/reminders'
import { useReminders } from '@/stores/reminders'

export function ReminderAlertActions({
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
    <div className="grid gap-3">
      <label htmlFor={inputId} className="text-xs text-muted-foreground">
        Adiar por
      </label>
      <select
        id={inputId}
        className="h-9 rounded border border-input bg-background px-3 text-sm"
        value={option}
        disabled={pending}
        onChange={(e) => {
          const selected = snoozeOptions.find(
            (value) => value === e.target.value
          )
          if (selected) setOption(selected)
        }}
      >
        {snoozeOptions.map((value) => (
          <option key={value} value={value}>
            {value} minutos
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => void act(false)}>
          Dispensar
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void act(true)}
        >
          Adiar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
