import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { WidgetPopup } from '@/popups/widget-popup'
import { nextReminder } from '@/services/system/reminders'
import { useReminders } from '@/stores/reminders'
import { Slot } from '@radix-ui/react-slot'
import { useEffect, useState } from 'react'
import { useReminderAnchor } from '../src/use-reminder-anchor'
import { Reminders } from './reminders.widget'

export function RemindersController() {
  const runtime = useWidgetRuntime()
  const view = useWidgetView()
  const anchor = useReminderAnchor()
  const snapshot = useReminders((s) =>
    runtime.interactive ? s.snapshot : null
  )
  const error = useReminders((s) => (runtime.interactive ? s.error : null))
  const [now, setNow] = useState(runtime.now)
  const active =
    snapshot?.reminders.some((r) => r.status === 'scheduled') ?? false
  useEffect(() => {
    if (!active) return
    return runtime.observeTime(setNow, 1000)
  }, [active, runtime])
  const next = nextReminder(snapshot?.reminders ?? [], now)
  const ringing = snapshot?.reminders.some((r) => r.status === 'ringing')
  const text = error
    ? `Lembretes: ${error}`
    : ringing
      ? 'Lembrete aguardando confirma\u00e7\u00e3o'
      : next
        ? `Pr\u00f3ximo lembrete: ${next.message}`
        : 'Lembretes'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="reminders">
      <WidgetPopup.Trigger asChild>
        <Slot {...tip.trigger}>
          <Reminders
            ref={anchor}
            next={next}
            now={now}
            ringing={!!ringing}
            error={error}
            format={view.format}
            aria-describedby={view.tooltip ? tip.describedBy : undefined}
          />
        </Slot>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
