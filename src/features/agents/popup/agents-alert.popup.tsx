import { definePopup } from '@/popups/definition'
import { Button } from '@/components/ui/button'
import { CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, X } from 'lucide-react'
import { z } from 'zod'
import type { AgentSession } from '@/services/system/agents.generated'
import { AgentsAlertPopupController } from './agents-alert.popup.controller'

export function AgentsAlert({
  sessions,
  close,
  error
}: {
  sessions: AgentSession[]
  close: () => void
  error: string | null
}) {
  return (
    <section
      role="alertdialog"
      aria-label="Agentes aguardando atenção"
      className="w-90"
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Bot aria-hidden="true" />
            Agentes aguardando atenção
          </CardTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fechar alerta"
            onClick={close}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <ul className="flex max-h-60 flex-col gap-2 overflow-y-auto">
            {sessions.map((session) => (
              <li key={`${session.agent}:${session.id}`}>
                {session.agent === 'codex' ? 'Codex' : 'OpenCode'} ·{' '}
                {session.title}
              </li>
            ))}
          </ul>
        )}
        <p className="text-body text-muted-foreground">
          Abra o widget de Agentes para consultar as sessões. Fechar mantém a
          atenção pendente na barra.
        </p>
      </CardContent>
    </section>
  )
}

export default definePopup({
  label: 'Alerta de agentes',
  Content: AgentsAlertPopupController,
  schema: z
    .object({ revision: z.number().int().nonnegative().optional() })
    .strict()
})
