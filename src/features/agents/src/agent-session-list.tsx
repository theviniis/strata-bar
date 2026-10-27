import type { AgentSession, SessionStatus } from '@/services/system/agents'
import type { ReactNode } from 'react'

const statuses: Record<SessionStatus, string> = {
  processing: 'Em execução',
  attention: 'Atenção necessária',
  completed: 'Último turno concluído',
  error: 'Último turno com erro',
  idle: 'Inativa',
  unknown: 'Estado desconhecido',
  disconnected: 'Desconectada'
}

export function AgentSessionList({
  sessions,
  label,
  stale,
  renderActions
}: {
  sessions: AgentSession[]
  label: string
  stale: boolean
  renderActions: ((session: AgentSession) => ReactNode) | undefined
}) {
  if (sessions.length === 0) return null
  return (
    <ul aria-label={label} className="max-h-64 space-y-2 overflow-y-auto">
      {sessions.map((session) => (
        <li
          key={`${session.connectionId}:${session.id}`}
          className="space-y-1 rounded-md border p-2"
        >
          <h4 className="text-body font-medium wrap-anywhere">
            {session.title}
          </h4>
          <span
            data-status={stale ? 'disconnected' : session.status}
            className="inline-flex rounded-md bg-muted px-2 py-0.5 text-body text-muted-foreground data-[status=attention]:text-destructive"
          >
            {statuses[stale ? 'disconnected' : session.status]}
          </span>
          <p className="text-body text-muted-foreground wrap-anywhere">
            {session.directory}
          </p>
          {renderActions?.(session)}
        </li>
      ))}
    </ul>
  )
}
