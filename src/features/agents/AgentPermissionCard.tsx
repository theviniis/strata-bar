import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type {
  AgentPermission,
  AgentPermissionDecision,
  AgentPermissionRequest
} from '@/services/system/agents'

export function AgentPermissionCard({
  permission,
  disabled,
  onDecision
}: {
  permission: AgentPermission
  disabled: boolean
  onDecision?: (request: AgentPermissionRequest) => Promise<void>
}) {
  const [pending, setPending] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const blocked =
    disabled ||
    pending ||
    attempted ||
    permission.replyBlocked ||
    !!permission.unsupportedReason ||
    !onDecision
  const decide = async (decision: AgentPermissionDecision) => {
    if (blocked || !onDecision) return
    setPending(true)
    setAttempted(true)
    setError(null)
    try {
      await onDecision({
        sessionId: permission.sessionId,
        permissionId: permission.id,
        version: permission.version,
        decision
      })
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      aria-label="Permissão de ferramenta"
      className="space-y-2 border-t pt-2"
    >
      <h5 className="text-xs font-medium wrap-anywhere">
        Permissão: {permission.action}
      </h5>
      <ul
        aria-label="Recursos solicitados"
        className="max-h-40 space-y-1 overflow-y-auto"
      >
        {permission.resources.map((resource, index) => (
          <li key={index} className="text-xs whitespace-pre-wrap wrap-anywhere">
            {resource}
          </li>
        ))}
      </ul>
      <pre
        aria-label="Contexto da operação"
        className="max-h-48 overflow-y-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap wrap-anywhere"
      >
        {permission.details}
      </pre>
      <p className="text-xs text-muted-foreground">
        Aprovar uma vez permite somente esta solicitação, sem criar uma regra
        permanente.
      </p>
      {permission.unsupportedReason && (
        <p className="text-xs text-muted-foreground">
          {permission.unsupportedReason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={blocked}
          onClick={() => void decide('approveOnce')}
        >
          Aprovar uma vez
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => void decide('reject')}
        >
          Recusar
        </Button>
      </div>
      {pending && (
        <p role="status" className="text-xs">
          Enviando decisão…
        </p>
      )}
      {(permission.replyBlocked || attempted) && !pending && (
        <p className="text-xs text-muted-foreground">
          Decisão já tentada. Confira a solicitação no OpenCode.
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
