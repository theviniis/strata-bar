import { expect, it } from 'vitest'
import { countAgentAttention } from '@/features/agents/src/attention'
import { agentsFixture } from '@/features/agents/src/fixtures'
import type { Config } from '@/services/configuration/config'

const visible: Config['agents']['visible'] = {
  opencode: true,
  codex: true
}

it('counts only attention sessions from connected, visible agent sources', () => {
  const snapshot = agentsFixture()
  snapshot.codex = {
    status: 'connected',
    error: null,
    sessions: [
      {
        id: '01a1543f-85be-7fb2-9f2d-4d30b7492a78',
        agent: 'codex',
        connectionId: 'codex-hooks',
        title: 'Needs approval',
        directory: 'D:/project',
        status: 'attention',
        updatedAt: 1000
      }
    ]
  }
  snapshot.opencode.sessions.push({
    id: 'ses_processing',
    agent: 'opencode',
    connectionId: 'opencode-local',
    title: 'Working',
    directory: 'D:/project',
    status: 'processing',
    updatedAt: 1000
  })

  expect(countAgentAttention(snapshot, visible, null)).toBe(2)
  expect(
    countAgentAttention(snapshot, { ...visible, codex: false }, null)
  ).toBe(1)
  snapshot.codex.status = 'disconnected'
  expect(countAgentAttention(snapshot, visible, null)).toBe(1)
  expect(countAgentAttention(snapshot, visible, 'Transport failed')).toBe(0)
  expect(countAgentAttention(null, visible, null)).toBe(0)
})

it('keeps the widget in its normal state when no connected session needs attention', () => {
  const snapshot = agentsFixture()
  snapshot.opencode.sessions[0].status = 'processing'
  expect(countAgentAttention(snapshot, visible, null)).toBe(0)
})
