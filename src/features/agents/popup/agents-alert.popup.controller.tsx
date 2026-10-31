import { useEffect, useState } from 'react'
import { usePopupContext } from '@/popups/context'
import { getAgentsStore } from '@/stores/agents'
import { useConfig } from '@/stores/config'
import { AgentsAlert } from './agents-alert.popup'

export function AgentsAlertPopupController() {
  const { params, close } = usePopupContext('agentsAlert')
  const [useStore] = useState(getAgentsStore)
  const snapshot = useStore((state) => state.snapshot)
  const error = useStore((state) => state.error)
  const visible = useConfig((state) => state.config.agents.visible)
  useEffect(() => useStore.getState().connect(), [useStore])
  const sessions = snapshot
    ? (['codex', 'opencode'] as const).flatMap((agent) =>
        visible[agent] && snapshot[agent].status === 'connected'
          ? snapshot[agent].sessions.filter(
              (session) => session.status === 'attention'
            )
          : []
      )
    : []
  const synchronized =
    snapshot !== null && snapshot.revision >= (params.revision ?? 0)
  useEffect(() => {
    if (synchronized && !error && sessions.length === 0) close()
  }, [synchronized, error, sessions.length, close])
  return (
    <AgentsAlert
      sessions={sessions}
      close={close}
      error={error ?? (!synchronized ? 'Carregando sessões…' : null)}
    />
  )
}
