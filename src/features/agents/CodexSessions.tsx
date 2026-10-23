import type { CodexSnapshot } from '@/services/system/agents.generated'
import { AgentSessionList } from './AgentSessionList'

const labels = {
  disabled: 'Hooks do Codex desativados',
  connecting: 'Aguardando eventos do Codex',
  connected: 'Eventos do Codex recebidos',
  disconnected: 'Conexão Codex indisponível'
} as const

export function CodexSessions({
  connection,
  stale
}: {
  connection: CodexSnapshot
  stale: boolean
}) {
  const enabled = connection.status !== 'disabled'
  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {stale ? 'Estado da conexão indisponível' : labels[connection.status]}
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
      <p className="text-xs text-muted-foreground">
        Somente sessões locais que emitirem eventos após a ativação serão
        exibidas. Conversas anteriores não são enumeradas. Nenhuma mensagem é
        armazenada.
      </p>
      {enabled && connection.sessions.length === 0 && (
        <p className="text-xs">Nenhuma sessão observada nesta conexão.</p>
      )}
      <AgentSessionList
        sessions={connection.sessions}
        label="Sessões do Codex"
        stale={stale}
        renderActions={undefined}
      />
      <p className="text-xs text-muted-foreground">
        Pedidos de aprovação aparecem como atenção. Turnos encerrados ficam
        ociosos: o hook não comprova sucesso. Sem eventos por dois minutos,
        processamento e atenção ficam desconhecidos. Criar sessões, responder e
        notificações do Codex ainda não estão disponíveis.
      </p>
    </div>
  )
}
