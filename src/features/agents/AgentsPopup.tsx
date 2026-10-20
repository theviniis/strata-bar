import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Settings2 } from 'lucide-react'
import { useConfig } from '@/stores/config'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { usePopupContext } from '@/popups/context'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import type {
  AgentPermissionRequest,
  AgentReplyRequest,
  AgentType,
  AgentsSnapshot,
  CreateAgentSessionResult
} from '@/services/system/agents.generated'
import { createAgentsStore, getAgentsStore } from '@/stores/agents'
import { useEffect, useId, useState } from 'react'
import { AgentAlerts } from './AgentAlerts'
import { AntigravitySessions } from './AntigravitySessions'
import { OpenCodeSessions } from './OpenCodeSessions'
import { CodexSessions } from './CodexSessions'

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
  const configureCodex = useStore((state) => state.configureCodex)
  const createOpenCode = useStore((state) => state.createOpenCode)
  const replyOpenCode = useStore((state) => state.replyOpenCode)
  const decideOpenCode = useStore((state) => state.decideOpenCode)
  const dismissAlerts = useStore((state) => state.dismissAlerts)
  useEffect(() => useStore.getState().connect(), [useStore])
  return (
    <AgentsPopupContent
      snapshot={snapshot}
      error={error}
      demo={mode === 'demo'}
      onConfigureOpenCode={configureOpenCode}
      onConfigureAntigravity={configureAntigravity}
      onConfigureCodex={configureCodex}
      onCreateOpenCode={createOpenCode}
      onReplyOpenCode={replyOpenCode}
      onDecideOpenCode={decideOpenCode}
      onDismissAlerts={dismissAlerts}
    />
  )
}

const labels = {
  chatgpt: 'ChatGPT Desktop',
  opencode: 'OpenCode',
  antigravity: 'Antigravity',
  codex: 'Codex local'
} as const

export function AgentsPopupContent({
  snapshot,
  error,
  demo = false,
  onConfigureOpenCode,
  onConfigureAntigravity,
  onConfigureCodex,
  onCreateOpenCode,
  onReplyOpenCode,
  onDecideOpenCode,
  onDismissAlerts
}: {
  snapshot: AgentsSnapshot | null
  error: string | null
  demo?: boolean
  onConfigureOpenCode?: (enabled: boolean) => Promise<void>
  onConfigureAntigravity?: (enabled: boolean) => Promise<void>
  onConfigureCodex?: (enabled: boolean) => Promise<void>
  onCreateOpenCode?: (
    directory?: string,
    prompt?: string
  ) => Promise<CreateAgentSessionResult>
  onReplyOpenCode?: (request: AgentReplyRequest) => Promise<void>
  onDecideOpenCode?: (request: AgentPermissionRequest) => Promise<void>
  onDismissAlerts?: (ids: string[]) => Promise<void>
}) {
  const discoveryError = error ?? snapshot?.error
  const visible = useConfig((state) => state.config.agents.visible)
  const setAgentVisible = useConfig((state) => state.setAgentVisible)
  const configError = useConfig((state) => state.error)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsId = useId()
  const [selectedAgent, setSelectedAgent] = useState<AgentType>('chatgpt')
  const applications =
    snapshot?.applications.filter((app) => visible[app.agent]) ?? []
  const activeAgent =
    applications.find((app) => app.agent === selectedAgent)?.agent ??
    applications[0]?.agent ??
    null
  return (
    <section className="w-150" aria-label="Controle de agentes">
      <CardHeader>
        <CardTitle>Agentes de IA</CardTitle>
        <CardDescription>Aplicativos neste Windows</CardDescription>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={settingsOpen}
          aria-controls={settingsId}
          onClick={() => setSettingsOpen((open) => !open)}
        >
          <Settings2 aria-hidden="true" />
          Selecionar agentes
        </Button>
        {demo && (
          <p className="text-xs text-muted-foreground">
            Demo · sem acesso ao sistema
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {settingsOpen && (
          <fieldset id={settingsId} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">
              Agentes visíveis
            </legend>
            {(Object.keys(labels) as AgentType[]).map((agent) => (
              <label key={agent} className="flex items-center gap-2 text-sm">
                <Checkbox
                  aria-label={`Mostrar ${labels[agent]}`}
                  checked={visible[agent]}
                  onCheckedChange={(checked) => {
                    if (
                      setAgentVisible(agent, checked === true) &&
                      !checked &&
                      activeAgent === agent
                    ) {
                      setSelectedAgent(
                        applications.find((app) => app.agent !== agent)
                          ?.agent ?? 'chatgpt'
                      )
                    }
                  }}
                />
                {labels[agent]}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Controla a exibição das abas e dos alertas no Strata. As conexões
              existentes continuam ativas.
            </p>
          </fieldset>
        )}
        {configError && (
          <p role="alert" className="text-xs text-destructive">
            Não foi possível salvar a seleção: {configError}
          </p>
        )}
        {discoveryError && (
          <p role="alert" className="text-sm text-destructive">
            Detecção indisponível: {discoveryError}
          </p>
        )}
        {!snapshot && !error && <p role="status">Detectando aplicativos…</p>}
        {snapshot && (
          <AgentAlerts
            alerts={{
              ...snapshot.alerts,
              items: snapshot.alerts.items.filter(
                (alert) => visible[alert.agent]
              )
            }}
            notifications={snapshot.notifications}
            onDismiss={onDismissAlerts}
          />
        )}
        {snapshot && applications.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum agente selecionado.
          </p>
        )}
        {applications.length > 0 && (
          <Tabs
            value={activeAgent}
            onValueChange={(value) => {
              const application = applications.find(
                (app) => app.agent === value
              )
              if (application) setSelectedAgent(application.agent)
            }}
            size="sm"
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
                  <p className="text-xs text-muted-foreground">
                    {discoveryError || application.running === null
                      ? 'Detecção indisponível'
                      : application.running
                        ? 'Processo detectado'
                        : 'Processo não detectado'}
                  </p>
                  {application.agent === 'opencode' ? (
                    <OpenCodeSessions
                      connection={snapshot.opencode}
                      onConfigure={onConfigureOpenCode}
                      stale={!!error}
                      onCreate={onCreateOpenCode}
                      onReply={onReplyOpenCode}
                      onDecision={onDecideOpenCode}
                    />
                  ) : application.agent === 'antigravity' ? (
                    <AntigravitySessions
                      connection={snapshot.antigravity}
                      onConfigure={onConfigureAntigravity}
                      stale={!!error}
                    />
                  ) : application.agent === 'codex' ? (
                    <CodexSessions
                      connection={snapshot.codex}
                      onConfigure={onConfigureCodex}
                      stale={!!error}
                    />
                  ) : (
                    <>
                      <p className="text-xs">Sessões indisponíveis</p>
                      <p className="text-xs text-muted-foreground">
                        Controle de sessões ainda não integrado. Um processo
                        aberto não informa o estado das conversas. Para sessões
                        locais como as do Codex, abra a seção Codex local neste
                        painel e ative seus hooks.
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
      </CardContent>
    </section>
  )
}
