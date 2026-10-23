import { useEffect, useState } from 'react'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { nextReminder } from '@/services/system/reminders'
import { useReminders } from '@/stores/reminders'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'

import { useReminderAnchor } from './useReminderAnchor'
import { Reminders } from './Reminders'

export function RemindersController() {
  const preview = useWidgetPreview()
  const view = useWidgetView()
  const anchor = useReminderAnchor()
  const snapshot = useReminders((s) => (preview ? null : s.snapshot))
  const error = useReminders((s) => (preview ? null : s.error))
  const [now, setNow] = useState(Date.now)
  const active =
    snapshot?.reminders.some((r) => r.status === 'scheduled') ?? false
  useEffect(() => {
    if (!active) return
    const tick = () => setNow(Date.now())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [active])
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
      <WidgetPopup.Anchor asChild>
        <div ref={anchor}>
          <WidgetPopup.Trigger asChild>
            <Reminders
              next={next}
              now={now}
              ringing={!!ringing}
              error={error}
              format={view.format}
              aria-describedby={view.tooltip ? tip.describedBy : undefined}
              {...tip.trigger}
            />
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
