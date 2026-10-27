import type {
  AgentAlertsSnapshot,
  AgentNotificationsSnapshot
} from '@/services/system/agents'
import { useState } from 'react'
import { AgentAlerts } from './agent-alerts'
export function AgentAlertsController({
  alerts,
  notifications,
  onDismiss
}: {
  alerts: AgentAlertsSnapshot
  notifications?: AgentNotificationsSnapshot
  onDismiss?: (ids: string[]) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dismiss = async (ids: string[]) => {
    if (!onDismiss || pending) return
    setPending(true)
    setError(null)
    try {
      await onDismiss(ids)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <AgentAlerts
      alerts={alerts}
      notifications={notifications}
      times={Object.fromEntries(
        alerts.items.map((alert) => [
          alert.id,
          {
            iso: new Date(alert.createdAt).toISOString(),
            text: new Date(alert.createdAt).toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit'
            })
          }
        ])
      )}
      pending={pending}
      error={error}
      onDismiss={onDismiss ? (ids) => void dismiss(ids) : undefined}
    />
  )
}
