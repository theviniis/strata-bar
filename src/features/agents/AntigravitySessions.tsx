import { Button } from '@/components/ui/button'
import type { AntigravitySnapshot } from '@/services/system/agents'
import { AgentSessionList } from './AgentSessionList'

const labels = {
  disabled: 'Hooks desativados',
  connecting: 'Aguardando eventos do Antigravity',
  connected: 'Eventos do Antigravity recebidos',
  disconnected: 'Antigravity desconectado'
} as const

export function AntigravitySessions({
  connection,
  stale = false
}: {
  connection: AntigravitySnapshot
  stale?: boolean
}) {
  const enabled = connection.status !== 'disabled'
  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {stale ? 'Estado da conexão indisponível' : labels[connection.status]}
      </p>
      <p className="text-xs text-muted-foreground">
        Somente sessões que emitirem eventos após a conexão serão exibidas.
        Conversas anteriores não são enumeradas.
      </p>
      {connection.status === 'disabled' && (
        <p className="text-xs text-muted-foreground">
          Configure esta integração em Configurações → Agentes.
        </p>
      )}
      {connection.error && (
        <p role="alert" className="text-xs text-destructive">
          {connection.error}
        </p>
      )}
      {enabled && connection.sessions.length === 0 && (
        <p className="text-xs">Nenhuma sessão observada nesta conexão.</p>
      )}
      <AgentSessionList
        sessions={connection.sessions}
        label="Sessões do Antigravity"
        stale={stale}
      />
      <p className="text-xs text-muted-foreground">
        Último estado observado. Execuções sem novos eventos por dois minutos
        ficam com estado desconhecido. Aprovações de comandos não são
        detectadas; apenas chamadas explícitas de pergunta ou permissão.
      </p>
      <div className="flex gap-2">
        <Button size="sm" disabled>
          Nova sessão
        </Button>
        <Button size="sm" variant="outline" disabled>
          Responder
        </Button>
      </div>
    </div>
  )
}
