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
import { OpenCodeSessions } from './OpenCodeSessions'
import { AntigravitySessions } from './AntigravitySessions'

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
  const configureOpenCode = useStore((state) => state.configureOpenCode)
  const configureAntigravity = useStore((state) => state.configureAntigravity)
  const createOpenCode = useStore((state) => state.createOpenCode)
  useEffect(() => useStore.getState().connect(), [useStore])
  return (
    <AgentsPopupContent
      snapshot={snapshot}
      error={error}
      demo={mode === 'demo'}
      onConfigureOpenCode={configureOpenCode}
      onConfigureAntigravity={configureAntigravity}
      onCreateOpenCode={createOpenCode}
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
  demo = false,
  onConfigureOpenCode,
  onConfigureAntigravity,
  onCreateOpenCode
}: {
  snapshot: AgentsSnapshot | null
  error: string | null
  demo?: boolean
  onConfigureOpenCode?: (enabled: boolean) => Promise<void>
  onConfigureAntigravity?: (enabled: boolean) => Promise<void>
  onCreateOpenCode?: (directory: string) => Promise<string>
}) {
  const discoveryError = error ?? snapshot?.error
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
        {discoveryError && (
          <p role="alert" className="text-sm text-destructive">
            Detecção indisponível: {discoveryError}
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
                    {discoveryError || application.running === null
                      ? 'Detecção indisponível'
                      : application.running
                        ? 'Processo detectado'
                        : 'Processo não detectado'}
                  </span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-2">
                {application.agent === 'opencode' ? (
                  <OpenCodeSessions
                    connection={snapshot.opencode}
                    onConfigure={onConfigureOpenCode}
                    stale={!!error}
                    onCreate={onCreateOpenCode}
                  />
                ) : application.agent === 'antigravity' ? (
                  <AntigravitySessions
                    connection={snapshot.antigravity}
                    onConfigure={onConfigureAntigravity}
                    stale={!!error}
                  />
                ) : (
                  <>
                    <p className="text-xs">Sessões indisponíveis</p>
                    <p className="text-xs text-muted-foreground">
                      Controle de sessões ainda não integrado. Um processo
                      aberto não informa o estado das conversas.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" disabled>
                        Nova sessão
                      </Button>
                      <Button size="sm" variant="outline" disabled>
                        Responder
                      </Button>
                    </div>
                  </>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </section>
  )
}
