import { Button } from '@/components/ui/button'
import type {
  AgentPermission,
  AgentPermissionDecision
} from '@/services/system/agents'
export interface AgentPermissionCardProps {
  permission: AgentPermission
  pending: boolean
  attempted: boolean
  error: string | null
  blocked: boolean
  onDecision: (decision: AgentPermissionDecision) => void
}
export function AgentPermissionCard({
  permission,
  pending,
  attempted,
  error,
  blocked,
  onDecision
}: AgentPermissionCardProps) {
  return (
    <section
      aria-label="Permissão de ferramenta"
      className="space-y-2 border-t pt-2"
    >
      <h5 className="text-body font-medium wrap-anywhere">
        Permissão: {permission.action}
      </h5>
      <ul
        aria-label="Recursos solicitados"
        className="max-h-40 space-y-1 overflow-y-auto"
      >
        {permission.resources.map((resource, index) => (
          <li
            key={index}
            className="text-body whitespace-pre-wrap wrap-anywhere"
          >
            {resource}
          </li>
        ))}
      </ul>
      <pre
        aria-label="Contexto da operação"
        className="max-h-48 overflow-y-auto rounded bg-muted p-2 text-body whitespace-pre-wrap wrap-anywhere"
      >
        {permission.details}
      </pre>
      <p className="text-body text-muted-foreground">
        Aprovar uma vez permite somente esta solicitação, sem criar uma regra
        permanente.
      </p>
      {permission.unsupportedReason && (
        <p className="text-body text-muted-foreground">
          {permission.unsupportedReason}
        </p>
      )}
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={blocked}
          onClick={() => onDecision('approveOnce')}
        >
          Aprovar uma vez
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={blocked}
          onClick={() => onDecision('reject')}
        >
          Recusar
        </Button>
      </div>
      {pending && (
        <p role="status" className="text-body">
          Enviando decisão…
        </p>
      )}
      {(permission.replyBlocked || attempted) && !pending && (
        <p className="text-body text-muted-foreground">
          Decisão já tentada. Confira a solicitação no OpenCode.
        </p>
      )}
      {error && (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      )}
    </section>
  )
}
