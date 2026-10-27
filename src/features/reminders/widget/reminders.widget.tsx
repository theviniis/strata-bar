import {
  showLabel,
  type WidgetView
} from '@/components/status-bar/presentation'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel
} from '@/components/widget-item'
import type { Reminder } from '@/services/system/reminders.generated'
import { Bell, BellRing } from 'lucide-react'
import type { ComponentProps } from 'react'
import { formatCountdown } from '../src/presentation'

export interface RemindersProps extends ComponentProps<typeof WidgetItem> {
  next: Reminder | null
  now: number
  ringing: boolean
  error: string | null
  format: WidgetView['format']
}
export function Reminders({
  next,
  now,
  ringing,
  error,
  format,
  ...props
}: RemindersProps) {
  return (
    <WidgetItem type="button" aria-label="Abrir lembretes" {...props}>
      <WidgetItemIcon
        icon={ringing ? BellRing : Bell}
        aria-hidden="true"
        className={error ? 'text-destructive' : undefined}
      />
      {next && showLabel(format) && (
        <WidgetItemLabel aria-label="Tempo restante">
          {formatCountdown(next.notifyAt - now)}
        </WidgetItemLabel>
      )}
    </WidgetItem>
  )
}
