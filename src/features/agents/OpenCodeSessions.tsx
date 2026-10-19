import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OpenCodeSnapshot, SessionStatus } from '@/services/system/agents'

const statuses: Record<SessionStatus, string> = {
  processing: 'Em execução',
  attention: 'Atenção necessária',
  completed: 'Último turno concluído',
  error: 'Último turno com erro',
  idle: 'Inativa',
  unknown: 'Estado desconhecido',
  disconnected: 'Desconectada'
}
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
      {connection.sessions.length > 0 && (
        <ul
          aria-label="Sessões do OpenCode"
          className="max-h-64 space-y-2 overflow-y-auto"
        >
          {connection.sessions.map((session) => (
            <li
              key={`${session.connectionId}:${session.id}`}
              className="space-y-1 rounded-md border p-2"
            >
              <h4 className="text-sm font-medium wrap-anywhere">
                {session.title}
              </h4>
              <span
                data-status={stale ? 'disconnected' : session.status}
                className="inline-flex rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground data-[status=attention]:text-destructive"
              >
                {statuses[stale ? 'disconnected' : session.status]}
              </span>
              <p className="text-xs text-muted-foreground wrap-anywhere">
                {session.directory}
              </p>
            </li>
          ))}
        </ul>
      )}
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
