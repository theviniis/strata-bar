import { definePopup } from '@/popups/definition'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  AgentType,
  AgentsSnapshot,
  AgentPermissionRequest,
  AgentReplyRequest,
  CreateAgentSessionResult
} from '@/services/system/agents.generated'
import { type ReactNode, useEffect, useState } from 'react'
import { useConfig } from '@/stores/config'
import { usePopupContext } from '@/popups/context'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { createAgentsStore, getAgentsStore } from '@/stores/agents'
import { AgentAlertsController } from './AgentAlertsController'
import { AntigravitySessions } from './AntigravitySessions'
import { OpenCodeSessionsController } from './OpenCodeSessionsController'
import { CodexSessions } from './CodexSessions'

const labels = {
  chatgpt: 'ChatGPT Desktop',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  codex: 'Codex local'
} as const

export interface AgentsPopupProps {
  snapshot: AgentsSnapshot | null
  error: string | null
  demo: boolean
  applications: AgentsSnapshot['applications']
  activeAgent: AgentType | null
  alerts: ReactNode
  sessions: Partial<Record<AgentType, ReactNode>>
  onAgentChange: (agent: string) => void
}
export function AgentsPopup({
  snapshot,
  error,
  demo,
  applications,
  activeAgent,
  alerts,
  sessions,
  onAgentChange
}: AgentsPopupProps) {
  const discoveryError = error ?? snapshot?.error
  return (
    <section className="w-90 space-y-3 p-4" aria-label="Controle de agentes">
      <div>
        {demo && (
          <p className="text-body text-muted-foreground">
            Demo · sem acesso ao sistema
          </p>
        )}
        {discoveryError && (
          <p role="alert" className="text-body text-destructive">
            Detecção indisponível: {discoveryError}
          </p>
        )}
      </div>
      {!snapshot && !error && <p role="status">Detectando aplicativos…</p>}
      {snapshot && alerts}
      {snapshot && applications.length === 0 && (
        <p className="text-body text-muted-foreground">
          Nenhum agente selecionado. Escolha os agentes em Configurações →
          Agentes.
        </p>
      )}
      {applications.length > 0 && (
        <Tabs
          value={activeAgent}
          onValueChange={(value) => onAgentChange(value)}
        >
          <TabsList aria-label="Agentes de IA" className="flex w-full">
            {applications.map((application) => (
              <TabsTrigger
                key={application.agent}
                value={application.agent}
                className="flex-1"
              >
                {labels[application.agent]}
              </TabsTrigger>
            ))}
          </TabsList>
          {snapshot &&
            applications.map((application) => (
              <TabsContent
                key={application.agent}
                value={application.agent}
                className="space-y-2"
              >
                <p className="text-body text-muted-foreground">
                  {discoveryError || application.running === null
                    ? 'Detecção indisponível'
                    : application.running
                      ? 'Processo detectado'
                      : 'Processo não detectado'}
                </p>
                {application.agent !== 'chatgpt' ? (
                  sessions[application.agent]
                ) : (
                  <>
                    <p className="text-body">Sessões indisponíveis</p>
                    <p className="text-body text-muted-foreground">
                      Controle de sessões ainda não integrado. Um processo
                      aberto não informa o estado das conversas. Para sessões
                      locais como as do Codex, abra a seção Codex local neste
                      painel. Ative os hooks em Configurações → Agentes.
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
              </TabsContent>
            ))}
        </Tabs>
      )}
    </section>
  )
}

export function AgentsPopupController() {
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
  const createOpenCode = useStore((state) => state.createOpenCode)
  const replyOpenCode = useStore((state) => state.replyOpenCode)
  const decideOpenCode = useStore((state) => state.decideOpenCode)
  const dismissAlerts = useStore((state) => state.dismissAlerts)
  useEffect(() => useStore.getState().connect(), [useStore])
  return (
    <AgentsPopupStateController
      snapshot={snapshot}
      error={error}
      demo={mode === 'demo'}
      onCreateOpenCode={createOpenCode}
      onReplyOpenCode={replyOpenCode}
      onDecideOpenCode={decideOpenCode}
      onDismissAlerts={dismissAlerts}
    />
  )
}

export function AgentsPopupStateController({
  snapshot,
  error,
  demo = false,
  onCreateOpenCode,
  onReplyOpenCode,
  onDecideOpenCode,
  onDismissAlerts
}: {
  snapshot: AgentsSnapshot | null
  error: string | null
  demo?: boolean
  onCreateOpenCode?: (
    directory?: string,
    prompt?: string
  ) => Promise<CreateAgentSessionResult>
  onReplyOpenCode?: (request: AgentReplyRequest) => Promise<void>
  onDecideOpenCode?: (request: AgentPermissionRequest) => Promise<void>
  onDismissAlerts?: (ids: string[]) => Promise<void>
}) {
  const visible = useConfig((state) => state.config.agents.visible)
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('chatgpt')
  const applications =
    snapshot?.applications.filter((app) => visible[app.agent]) ?? []
  const activeAgent =
    applications.find((app) => app.agent === selectedAgent)?.agent ??
    applications[0]?.agent ??
    null
  return (
    <AgentsPopup
      snapshot={snapshot}
      error={error}
      demo={demo}
      applications={applications}
      activeAgent={activeAgent}
      onAgentChange={(value) => {
        const application = applications.find((app) => app.agent === value)
        if (application) setSelectedAgent(application.agent)
      }}
      alerts={
        snapshot && (
          <AgentAlertsController
            alerts={{
              ...snapshot.alerts,
              items: snapshot.alerts.items.filter(
                (alert) => visible[alert.agent]
              )
            }}
            notifications={snapshot.notifications}
            onDismiss={onDismissAlerts}
          />
        )
      }
      sessions={
        snapshot
          ? {
              opencode: (
                <OpenCodeSessionsController
                  connection={snapshot.opencode}
                  stale={!!error}
                  onCreate={onCreateOpenCode}
                  onReply={onReplyOpenCode}
                  onDecision={onDecideOpenCode}
                />
              ),
              antigravity: (
                <AntigravitySessions
                  connection={snapshot.antigravity}
                  stale={!!error}
                />
              ),
              codex: (
                <CodexSessions connection={snapshot.codex} stale={!!error} />
              )
            }
          : {}
      }
    />
  )
}

export default definePopup({
  label: 'Agentes de IA',
  Content: AgentsPopupController
})
