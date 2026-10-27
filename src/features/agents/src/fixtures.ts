import type {
  AgentMessage,
  AgentPermission,
  AgentsSnapshot
} from '@/services/system/agents.generated'
export const AGENTS_FIXTURE_TIME = 1700000000000
export function agentQuestionFixture(): AgentMessage {
  return {
    id: 'que_demo',
    sessionId: 'ses_demo',
    connectionId: 'opencode-local',
    version: 'a'.repeat(64),
    title: 'Qual caminho usar?',
    fields: [
      {
        key: 'path',
        title: 'Caminho',
        description: null,
        required: true,
        minLength: 1,
        maxLength: 200
      }
    ],
    unsupportedReason: null,
    replyBlocked: false
  }
}
export function agentPermissionFixture(): AgentPermission {
  return {
    id: 'per_demo',
    sessionId: 'ses_demo',
    version: 'b'.repeat(64),
    action: 'shell',
    resources: ['pnpm test'],
    details: 'Executar testes do projeto',
    unsupportedReason: null,
    replyBlocked: false
  }
}
export function agentsFixture(): AgentsSnapshot {
  return {
    version: 9,
    revision: 0,
    observedAt: AGENTS_FIXTURE_TIME,
    error: null,
    applications: [
      { agent: 'chatgpt', running: true },
      { agent: 'opencode', running: true },
      { agent: 'antigravity', running: false },
      { agent: 'codex', running: true }
    ],
    notifications: { status: 'demo', skipped: 0 },
    alerts: {
      items: [
        {
          id: 'alert_demo',
          agent: 'opencode',
          sessionId: 'ses_demo',
          sessionTitle: 'Revisar implementação',
          kind: 'attention',
          createdAt: AGENTS_FIXTURE_TIME
        }
      ],
      overflowCount: 0,
      paused: false
    },
    opencode: {
      status: 'connected',
      error: null,
      sessions: [
        {
          id: 'ses_demo',
          agent: 'opencode',
          connectionId: 'opencode-local',
          title: 'Revisar implementação',
          directory: 'D:/project',
          status: 'attention',
          updatedAt: AGENTS_FIXTURE_TIME
        }
      ],
      questions: [agentQuestionFixture()],
      permissions: [agentPermissionFixture()],
      hasMore: false,
      completedTurns: {}
    },
    antigravity: { status: 'disabled', sessions: [], error: null },
    codex: { status: 'connecting', sessions: [], error: null }
  }
}
