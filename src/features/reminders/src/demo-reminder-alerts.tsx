import { Button } from '@/components/ui/button'
import { overlayTextClasses } from '@/overlay/typography'
import type { ReactNode } from 'react'
export function DemoReminderAlerts({
  theme,
  silent,
  onEnableSound,
  alert
}: {
  theme: 'dark' | 'light'
  silent: boolean
  onEnableSound: () => void
  alert: ReactNode
}) {
  return (
    <div
      className={`group fixed top-4 right-4 z-50 ${overlayTextClasses}`}
      data-theme={theme}
    >
      {alert}
      {silent && (
        <Button variant="outline" onClick={onEnableSound}>
          Ativar som de demonstração
        </Button>
      )}
    </div>
  )
}
