import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  OpenCodeSnapshot,
  CreateAgentSessionResult,
  AgentReplyRequest
} from '@/services/system/agents'
import { AgentSessionList } from './AgentSessionList'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AgentQuestion } from './AgentQuestion'
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
  onCreate,
  onReply
}: {
  connection: OpenCodeSnapshot
  onConfigure?: (enabled: boolean) => Promise<void>
  stale?: boolean
  onCreate?: (
    directory: string,
    prompt?: string
  ) => Promise<CreateAgentSessionResult>
  onReply?: (request: AgentReplyRequest) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [directory, setDirectory] = useState('')
  const [created, setCreated] = useState<CreateAgentSessionResult | null>(null)
  const [prompt, setPrompt] = useState('')
  const [replyNotice, setReplyNotice] = useState<string | null>(null)
  const promptTooLong = new TextEncoder().encode(prompt).length > 4096
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
        renderActions={(session) =>
          connection.questions
            .filter((q) => q.sessionId === session.id)
            .map((question) => (
              <AgentQuestion
                key={`${question.id}:${question.version}`}
                question={question}
                disabled={stale || connection.status !== 'connected'}
                onReply={
                  onReply
                    ? async (request) => {
                        await onReply(request)
                        setReplyNotice(
                          'Resposta enviada. Acompanhe o andamento no OpenCode.'
                        )
                      }
                    : undefined
                }
              />
            ))
        }
      />
      {connection.hasMore && (
        <p className="text-xs text-muted-foreground">
          Mostrando até 50 sessões recentes e as execuções ativas. Há mais
          histórico no OpenCode.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Perguntas textuais simples podem ser respondidas nos cards. Outros
        formulários e aprovações devem ser resolvidos no OpenCode.
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
      </div>
      {replyNotice && (
        <p role="status" className="text-xs">
          {replyNotice}
        </p>
      )}
      {creating && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (
              !canCreate ||
              pending ||
              !directory.trim() ||
              !onCreate ||
              promptTooLong
            )
              return
            setPending(true)
            setError(null)
            void onCreate(directory.trim(), prompt.trim() ? prompt : undefined)
              .then((result) => {
                setCreated(result)
                setError(result.error)
                setCreating(false)
                setDirectory('')
                setPrompt('')
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
          <label className="space-y-1 text-xs">
            <span>Prompt inicial (opcional)</span>
            <Textarea
              value={prompt}
              maxLength={4096}
              disabled={pending || !canCreate}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Sem prompt, cria uma conversa vazia. Com prompt, envia o texto e
            inicia o trabalho nessa nova conversa. Limite: 4096 bytes UTF-8.
          </p>
          {promptTooLong && (
            <p role="alert" className="text-xs text-destructive">
              O prompt excede 4096 bytes UTF-8.
            </p>
          )}
          <Button
            size="sm"
            type="submit"
            disabled={
              !canCreate || pending || !directory.trim() || promptTooLong
            }
          >
            {pending
              ? 'Criando…'
              : prompt.trim()
                ? 'Criar e enviar prompt'
                : 'Criar conversa vazia'}
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
          Conversa criada: {created.sessionId}
          {created.promptStatus === 'accepted' && (
            <span className="block">
              Prompt aceito pelo OpenCode. Acompanhe o andamento na lista.
            </span>
          )}
        </p>
      )}
    </div>
  )
}
