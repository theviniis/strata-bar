import { Button } from '@/components/ui/button'
import { snoozeOptions, type SnoozeOption } from '@/services/system/reminders'
import { Trash } from 'lucide-react'

export interface ReminderAlertActionsProps {
  inputId: string
  option: SnoozeOption
  pending: boolean
  error: string | null
  onOptionChange: (option: SnoozeOption) => void
  onSnooze: () => void
  onDismiss: () => void
}
export function ReminderAlertActions({
  inputId,
  option,
  pending,
  error,
  onOptionChange,
  onSnooze,
  onDismiss
}: ReminderAlertActionsProps) {
  return (
    <div className="grid gap-3">
      <label htmlFor={inputId} className="text-caption text-muted-foreground">
        Adiar por
      </label>
      <select
        id={inputId}
        className="h-9 rounded border border-input bg-background px-3 text-body"
        value={option}
        disabled={pending}
        onChange={(e) => {
          const selected = snoozeOptions.find(
            (value) => value === e.target.value
          )
          if (selected) onOptionChange(selected)
        }}
      >
        {snoozeOptions.map((value) => (
          <option key={value} value={value}>
            {value} minutos
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          variant="outline"
          disabled={pending}
          onClick={onSnooze}
        >
          Adiar
        </Button>
        <Button
          className="flex-1"
          disabled={pending}
          onClick={onDismiss}
          variant="destructive"
        >
          <Trash data-icon="inline-start" /> Dispensar
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
