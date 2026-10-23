import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AgentsPopupContent } from '@/features/agents/AgentsPopup'
import {
  createDemoAgentsAdapter,
  parseAgentsSnapshot
} from '@/services/system/agents'

it('directs disabled Codex users to Settings without hook controls', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  fireEvent.click(screen.getByRole('tab', { name: /Codex local/ }))
  expect(
    screen.getByText(/Configure esta integração em Configurações → Agentes/)
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /hooks/ })
  ).not.toBeInTheDocument()
})

it('renders only Codex metadata and rejects provider mismatches', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  snapshot.codex = {
    status: 'connected',
    error: null,
    sessions: [
      {
        id: '01a1543f-85be-7fb2-9f2d-4d30b7492a78',
        agent: 'codex',
        connectionId: 'codex-hooks',
        title: 'Sessão 01a1543f',
        directory: 'C:\\work',
        status: 'attention',
        updatedAt: 1000
      }
    ]
  }
  expect(parseAgentsSnapshot(snapshot).codex.sessions).toHaveLength(1)
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  fireEvent.click(screen.getByRole('tab', { name: /Codex local/ }))
  expect(
    within(screen.getByRole('list', { name: 'Sessões do Codex' })).getByText(
      'Sessão 01a1543f'
    )
  ).toBeInTheDocument()
  snapshot.codex.sessions[0].connectionId = 'antigravity-hooks'
  expect(() => parseAgentsSnapshot(snapshot)).toThrow()
})
