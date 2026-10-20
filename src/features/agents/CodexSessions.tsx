import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
  onConfigure,
  stale = false
}: {
  connection: CodexSnapshot
  onConfigure?: (enabled: boolean) => Promise<void>
  stale?: boolean
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const enabled = connection.status !== 'disabled'
  const configure = async () => {
    if (!onConfigure || pending) return
    setPending(true)
    setError(null)
    try {
      await onConfigure(!enabled)
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="space-y-3">
      <p role="status" className="text-xs text-muted-foreground">
        {stale ? 'Estado da conexão indisponível' : labels[connection.status]}
      </p>
      <p className="text-xs text-muted-foreground">
        Ativar adiciona os hooks do Strata à configuração global do Codex,
        preservando os demais. Revise e confie nas definições no Codex antes de
        utilizá-las; o comando /hooks no CLI permite essa revisão. Reabra a
        sessão para carregar os hooks.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void configure()}
        disabled={!onConfigure || pending}
      >
        {enabled ? 'Desativar hooks do Codex' : 'Ativar hooks do Codex'}
      </Button>
      {(error || connection.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || connection.error}
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
