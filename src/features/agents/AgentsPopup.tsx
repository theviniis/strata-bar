import { Button } from '@/components/ui/button'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { AgentsSnapshot } from '@/services/system/agents.generated'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { createAgentsStore, getAgentsStore } from '@/stores/agents'
import { usePopupContext } from '@/popups/context'
import { useEffect, useState } from 'react'

export function AgentsPopup() {
  const { mode } = usePopupContext('agents')
  return <ConnectedAgentsPopup key={mode} mode={mode} />
}

function ConnectedAgentsPopup({ mode }: { mode: 'native' | 'demo' }) {
  const [useStore] = useState(() =>
    mode === 'native'
      ? getAgentsStore()
      : createAgentsStore(createDemoAgentsAdapter())
  )
  const snapshot = useStore((state) => state.snapshot)
  const error = useStore((state) => state.error)
  useEffect(() => useStore.getState().connect(), [useStore])
  return (
    <AgentsPopupContent
      snapshot={snapshot}
      error={error}
      demo={mode === 'demo'}
    />
  )
}

const labels = {
  chatgpt: 'ChatGPT Desktop',
  opencode: 'OpenCode',
  antigravity: 'Antigravity'
} as const

export function AgentsPopupContent({
  snapshot,
  error,
  demo = false
}: {
  snapshot: AgentsSnapshot | null
  error: string | null
  demo?: boolean
}) {
  return (
    <section className="w-80" aria-label="Controle de agentes">
      <CardHeader>
        <CardTitle>Agentes de IA</CardTitle>
        <CardDescription>Aplicativos neste Windows</CardDescription>
        {demo && (
          <p className="text-xs text-muted-foreground">
            Demo · sem acesso ao sistema
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            Detecção indisponível: {error}
          </p>
        )}
        {!snapshot && !error && <p role="status">Detectando aplicativos…</p>}
        <Accordion multiple={false}>
          {snapshot?.applications.map((application) => (
            <AccordionItem key={application.agent} value={application.agent}>
              <AccordionTrigger>
                <span className="flex flex-col gap-1">
                  <span>{labels[application.agent]}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {error || application.running === null
                      ? 'Detecção indisponível'
                      : application.running
                        ? 'Processo detectado'
                        : 'Processo não detectado'}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                <p className="text-xs">Sessões indisponíveis</p>
                <p className="text-xs text-muted-foreground">
                  Controle de sessões ainda não integrado. Um processo aberto
                  não informa o estado das conversas.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled>
                    Nova sessão
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Responder
                  </Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </section>
  )
}
