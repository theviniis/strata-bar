import { useState } from 'react'
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
  onConfigure,
  stale = false
}: {
  connection: AntigravitySnapshot
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
        Somente sessões que emitirem eventos após a conexão serão exibidas.
        Conversas anteriores não são enumeradas.
      </p>
      <p className="text-xs text-muted-foreground">
        Ativar adiciona os hooks do Strata à configuração global do Antigravity
        App 2, preservando os demais. Reabra o Antigravity para carregá-los.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void configure()}
        disabled={!onConfigure || pending}
      >
        {enabled
          ? 'Desativar hooks do Antigravity'
          : 'Ativar hooks do Antigravity'}
      </Button>
      {(error || connection.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || connection.error}
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
