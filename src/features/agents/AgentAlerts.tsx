import { Button } from '@/components/ui/button'
import type {
  AgentAlertsSnapshot,
  AgentNotificationsSnapshot
} from '@/services/system/agents'
import { Trash } from 'lucide-react'
import { useState } from 'react'

const labels = {
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  chatgpt: 'ChatGPT Desktop'
} as const

const notificationLabels = {
  checking: 'Verificando notificações do Windows…',
  ready:
    'Notificações do Windows disponíveis. A apresentação depende das preferências do sistema, incluindo Não incomodar.',
  blocked:
    'O Windows bloqueou as notificações. Os alertas continuam na barra e neste popup.',
  unavailable:
    'Instale o Strata pelo instalador para habilitar notificações do Windows. Os alertas visuais continuam disponíveis.',
  error:
    'Falha ao enviar ou verificar notificações do Windows. Os alertas continuam na barra e neste popup; eventos antigos não serão reenviados.',
  demo: 'Demonstração: nenhuma notificação será enviada ao Windows.'
} as const

export function AgentAlerts({
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
    <section
      aria-label="Alertas dos agentes"
      className="space-y-2 rounded-md border p-2"
    >
      <h3 className="text-sm font-medium">Alertas recentes</h3>
      <p className="text-xs text-muted-foreground">
        Alertas visuais na barra e neste popup.
      </p>
      {notifications && (
        <p className="text-xs text-muted-foreground" role="status">
          {notificationLabels[notifications.status]}
        </p>
      )}
      {notifications && notifications.skipped > 0 && (
        <p className="text-xs text-destructive">
          {notifications.skipped} notificações não foram enviadas por limite da
          fila ou indisponibilidade do serviço. Confira os alertas visuais.
        </p>
      )}
      {alerts.items.length === 0 ? (
        <p className="text-xs">Sem novos alertas.</p>
      ) : (
        <>
          <ul
            aria-label="Alertas recentes"
            aria-live="polite"
            aria-relevant="additions"
            className="max-h-48 space-y-2 overflow-y-auto"
          >
            {[...alerts.items].reverse().map((alert) => (
              <li
                key={alert.id}
                className="space-y-1 border-b pb-2 last:border-0"
              >
                <p className="text-xs font-medium">
                  {labels[alert.agent]} ·{' '}
                  {alert.kind === 'attention'
                    ? 'Atenção necessária'
                    : 'Turno concluído'}
                </p>
                <p className="text-xs wrap-anywhere">{alert.sessionTitle}</p>
                <time
                  className="text-xs text-muted-foreground"
                  dateTime={new Date(alert.createdAt).toISOString()}
                >
                  {new Date(alert.createdAt).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </time>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="ml-2"
                  disabled={!onDismiss || pending}
                  onClick={() => void dismiss([alert.id])}
                  aria-label={`Dispensar alerta de ${alert.sessionTitle}`}
                >
                  <Trash data-icon="inline-start" /> Dispensar
                </Button>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={!onDismiss || pending}
            onClick={() => void dismiss(alerts.items.map((alert) => alert.id))}
          >
            <Trash data-icon="inline-start" /> Dispensar exibidos
          </Button>
        </>
      )}
      {alerts.overflowCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {alerts.overflowCount} alertas anteriores saíram da lista nesta
          execução. São mantidos até 32 alertas recentes.
        </p>
      )}
      {alerts.paused && (
        <p role="alert" className="text-xs text-destructive">
          Novos alertas pausados por limite de capacidade. Reinicie o Strata
          para retomar.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
