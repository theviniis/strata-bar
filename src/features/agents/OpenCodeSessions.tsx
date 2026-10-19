import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OpenCodeSnapshot } from '@/services/system/agents'
import { AgentSessionList } from './AgentSessionList'
import { Input } from '@/components/ui/input'
const connectionLabels = {
  disabled: 'Conexão desativada',
  connecting: 'Conectando…',
  connected: 'Conectado',
  disconnected: 'Desconectado · tentando reconectar'
} as const

export function OpenCodeSessions({
  connection,
  onConfigure,
  stale = false,
  onCreate
}: {
  connection: OpenCodeSnapshot
  onConfigure?: (enabled: boolean) => Promise<void>
  stale?: boolean
  onCreate?: (directory: string) => Promise<string>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [directory, setDirectory] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const canCreate = !stale && connection.status === 'connected' && !!onCreate
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
        Perguntas e aprovações são verificadas nas execuções ativas. Respostas
        ainda indisponíveis.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!canCreate || pending}
          onClick={() => {
            setCreating(true)
            setCreated(null)
          }}
        >
          Nova sessão
        </Button>
        <Button size="sm" variant="outline" disabled>
          Responder
        </Button>
      </div>
      {creating && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canCreate || pending || !directory.trim() || !onCreate) return
            setPending(true)
            setError(null)
            void onCreate(directory.trim())
              .then((id) => {
                setCreated(id)
                setCreating(false)
                setDirectory('')
              })
              .catch((error: unknown) => {
                setError(error instanceof Error ? error.message : String(error))
              })
              .finally(() => setPending(false))
          }}
        >
          <label className="space-y-1 text-xs">
            <span>Pasta do projeto</span>
            <Input
              value={directory}
              maxLength={4096}
              disabled={pending || !canCreate}
              onChange={(event) => setDirectory(event.target.value)}
              required
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Cria uma conversa vazia. Nenhum prompt será enviado ou trabalho
            iniciado.
          </p>
          <Button
            size="sm"
            type="submit"
            disabled={!canCreate || pending || !directory.trim()}
          >
            {pending ? 'Criando…' : 'Criar conversa vazia'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            disabled={pending}
            onClick={() => setCreating(false)}
          >
            Cancelar
          </Button>
        </form>
      )}
      {created && (
        <p role="status" className="text-xs">
          Conversa criada: {created}
        </p>
      )}
    </div>
  )
}
