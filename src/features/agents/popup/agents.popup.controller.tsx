import type {
  AgentPermissionRequest,
  AgentReplyRequest,
  AgentType,
  AgentsSnapshot,
  CreateAgentSessionResult
} from '@/services/system/agents.generated'
import { useEffect, useState } from 'react'
import { useConfig } from '@/stores/config'
import { usePopupContext } from '@/popups/context'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { createAgentsStore, getAgentsStore } from '@/stores/agents'
import { AgentAlertsController } from '../src/agent-alerts-controller'
import { AntigravitySessions } from '../src/antigravity-sessions'
import { OpenCodeSessionsController } from '../src/open-code-sessions-controller'
import { CodexSessions } from '../src/codex-sessions'
import { AgentsPopup } from './agents.popup'

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
