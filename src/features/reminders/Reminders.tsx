import { Bell, BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { nextReminder } from '@/services/system/reminders'
import { useReminders } from '@/stores/reminders'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { showLabel } from '@/components/status-bar/presentation'

import { useReminderAnchor } from './useReminderAnchor'
import { formatCountdown } from './presentation'

export function Reminders() {
  const view = useWidgetView()
  const anchor = useReminderAnchor()
  const snapshot = useReminders((s) => s.snapshot)
  const error = useReminders((s) => s.error)
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
      ? 'Lembrete aguardando confirmação'
      : next
        ? `Próximo lembrete: ${next.message}`
        : 'Lembretes'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="reminders">
      <WidgetPopup.Anchor asChild>
        <div ref={anchor}>
          <WidgetPopup.Trigger asChild>
            <WidgetItem
              type="button"
              aria-label="Abrir lembretes"
              aria-describedby={view.tooltip ? tip.describedBy : undefined}
              {...tip.trigger}
            >
              <WidgetItemIcon
                icon={ringing ? BellRing : Bell}
                aria-hidden="true"
                className={error ? 'text-destructive' : undefined}
              />
              {next && showLabel(view.format) && (
                <WidgetItemLabel aria-label="Tempo restante">
                  {formatCountdown(next.notifyAt - now)}
                </WidgetItemLabel>
              )}
              {view.tooltip && (
                <WidgetItemTooltip id={tip.describedBy}>
                  {text}
                </WidgetItemTooltip>
              )}
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
