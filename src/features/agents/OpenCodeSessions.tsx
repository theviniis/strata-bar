import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OpenCodeSnapshot } from '@/services/system/agents'
import { AgentSessionList } from './AgentSessionList'
const connectionLabels = {
  disabled: 'Conexão desativada',
  connecting: 'Conectando…',
  connected: 'Conectado',
  disconnected: 'Desconectado · tentando reconectar'
} as const

export function OpenCodeSessions({
  connection,
  onConfigure,
  stale = false
}: {
  connection: OpenCodeSnapshot
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
        {stale
          ? 'Estado da conexão indisponível'
          : connectionLabels[connection.status]}
      </p>
      <p className="text-xs text-muted-foreground">
        Usa o servidor e a autenticação do OpenCode Desktop v2 instalado. A
        conexão fica ativa enquanto o Strata estiver aberto.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => void configure()}
        disabled={!onConfigure || pending}
      >
        {enabled ? 'Desconectar OpenCode' : 'Conectar OpenCode'}
      </Button>
      {(error || connection.error) && (
        <p role="alert" className="text-xs text-destructive">
          {error || connection.error}
        </p>
      )}
      {connection.status === 'connected' &&
        connection.sessions.length === 0 && (
          <p className="text-xs">Nenhuma sessão encontrada.</p>
        )}
      <AgentSessionList
        sessions={connection.sessions}
        label="Sessões do OpenCode"
        stale={stale}
      />
      {connection.hasMore && (
        <p className="text-xs text-muted-foreground">
          Mostrando até 50 sessões recentes e as execuções ativas. Há mais
          histórico no OpenCode.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Somente leitura. Perguntas e aprovações são verificadas nas execuções
        ativas.
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
