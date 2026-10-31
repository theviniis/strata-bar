import type { AgentsSnapshot } from '@/services/system/agents.generated'
import type { Config } from '@/services/configuration/config'

export function countAgentAttention(
  snapshot: AgentsSnapshot | null,
  visible: Config['agents']['visible'],
  error: string | null
): number {
  if (!snapshot || error) return 0
  return (['codex', 'opencode'] as const).reduce((count, agent) => {
    const source = snapshot[agent]
    return (
      count +
      (visible[agent] && source.status === 'connected'
        ? source.sessions.filter((session) => session.status === 'attention')
            .length
        : 0)
    )
  }, 0)
}
