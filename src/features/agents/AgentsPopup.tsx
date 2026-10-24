import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  AgentType,
  AgentsSnapshot
} from '@/services/system/agents.generated'
import type { ReactNode } from 'react'

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
          <p className="text-caption text-muted-foreground">
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
                <p className="text-caption text-muted-foreground">
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
                    <p className="text-caption">Sessões indisponíveis</p>
                    <p className="text-caption text-muted-foreground">
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
