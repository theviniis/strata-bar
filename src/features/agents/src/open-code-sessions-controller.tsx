import type {
  AgentPermissionRequest,
  AgentReplyRequest,
  CreateAgentSessionResult,
  OpenCodeSnapshot
} from '@/services/system/agents'
import { useState } from 'react'
import { AgentPermissionCardController as AgentPermissionCard } from './agent-permission-card-controller'
import { AgentQuestionController as AgentQuestion } from './agent-question-controller'
import {
  OpenCodeSessions,
  type OpenCodeSessionsProps
} from './open-code-sessions'
export function OpenCodeSessionsController({
  connection,
  stale = false,
  onCreate,
  onReply,
  onDecision
}: {
  connection: OpenCodeSnapshot
  stale?: boolean
  onCreate?: (
    directory?: string,
    prompt?: string
  ) => Promise<CreateAgentSessionResult>
  onReply?: (request: AgentReplyRequest) => Promise<void>
  onDecision?: (request: AgentPermissionRequest) => Promise<void>
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
  const onCreateSubmit: OpenCodeSessionsProps['onCreateSubmit'] = (event) => {
    event.preventDefault()
    if (!canCreate || pending || !onCreate || promptTooLong) return
    setPending(true)
    setError(null)
    void onCreate(
      directory.trim() || undefined,
      prompt.trim() ? prompt : undefined
    )
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
  }
  const renderActions: OpenCodeSessionsProps['renderActions'] = (session) => (
    <>
      {connection.permissions
        .filter((p) => p.sessionId === session.id)
        .map((permission) => (
          <AgentPermissionCard
            key={`${permission.id}:${permission.version}`}
            permission={permission}
            disabled={stale || connection.status !== 'connected'}
            onDecision={
              onDecision
                ? async (request) => {
                    await onDecision(request)
                    setReplyNotice(
                      'Decisão enviada. Acompanhe o andamento no OpenCode.'
                    )
                  }
                : undefined
            }
          />
        ))}
      {connection.questions
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
        ))}
    </>
  )
  return (
    <OpenCodeSessions
      connection={connection}
      stale={stale}
      pending={pending}
      error={error}
      creating={creating}
      directory={directory}
      created={created}
      prompt={prompt}
      replyNotice={replyNotice}
      promptTooLong={promptTooLong}
      canCreate={canCreate}
      renderActions={renderActions}
      onCreateSubmit={onCreateSubmit}
      onStartCreating={() => {
        setCreating(true)
        setCreated(null)
      }}
      onCancelCreating={() => setCreating(false)}
      onDirectoryChange={setDirectory}
      onPromptChange={setPrompt}
    />
  )
}
