import { DemoReminderAlerts } from './DemoReminderAlerts'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useEffect, useRef, useState } from 'react'
import { PopupHost } from '@/popups/PopupHost'
import {
  playDemoReminderSound,
  prepareDemoReminderSound
} from '@/services/system/reminder-sound'
import { useConfig } from '@/stores/config'
import { useReminders } from '@/stores/reminders'

export function DemoReminderAlertsController() {
  const snapshot = useReminders((s) => s.snapshot)
  const source = useReminders((s) => s.source)
  const theme = useResolvedTheme(useConfig((s) => s.config.bar.theme))
  const seen = useRef(new Set<string>())
  const [closed, setClosed] = useState<string[]>([])
  const [silent, setSilent] = useState(false)
  const next =
    source === 'demo'
      ? snapshot?.reminders
          .filter(
            (r) =>
              r.status === 'ringing' &&
              !closed.includes(`${r.id}:${r.notifyAt}`)
          )
          .sort((a, b) => a.notifyAt - b.notifyAt)[0]
      : undefined
  const key = next ? `${next.id}:${next.notifyAt}` : null
  useEffect(() => {
    if (!key || seen.current.has(key)) return
    seen.current.add(key)
    const play = () => setSilent(!playDemoReminderSound())
    play()
  }, [key])
  if (!next || !key) return null
  return (
    <DemoReminderAlerts
      theme={theme}
      silent={silent}
      onEnableSound={() => {
        prepareDemoReminderSound()
        setSilent(!playDemoReminderSound())
      }}
      alert={
        <PopupHost
          id="reminderAlert"
          params={{ id: next.id }}
          mode="demo"
          close={() => setClosed((previous) => [...previous, key])}
        />
      }
    />
  )
}
