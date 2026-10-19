import { render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AgentsPopup, AgentsPopupContent } from '@/features/agents/AgentsPopup'
import { PopupContext } from '@/popups/context'

it('distinguishes detected applications from unavailable session control', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 1,
        revision: 1,
        observedAt: 1000,
        error: null,
        applications: [
          { agent: 'chatgpt', running: true },
          { agent: 'opencode', running: false },
          { agent: 'antigravity', running: true }
        ]
      }}
      error={null}
    />
  )
  const chatgpt = within(
    screen.getByRole('region', { name: 'ChatGPT Desktop' })
  )
  expect(chatgpt.getByText('Processo detectado')).toBeInTheDocument()
  expect(chatgpt.getByText('Sessões indisponíveis')).toBeInTheDocument()
  expect(chatgpt.getByRole('button', { name: 'Nova sessão' })).toBeDisabled()
  expect(
    within(screen.getByRole('region', { name: 'OpenCode' })).getByText(
      'Processo não detectado'
    )
  ).toBeInTheDocument()
  expect(screen.queryByText('Concluído')).not.toBeInTheDocument()
})

it('labels the studio preview and lists each tool without claiming live sessions', async () => {
  render(
    <PopupContext.Provider
      value={{
        mode: 'demo',
        id: 'agents',
        params: {},
        close: () => {},
        side: 'bottom'
      }}
    >
      <AgentsPopup />
    </PopupContext.Provider>
  )
  expect(
    await screen.findByText('Demo · sem acesso ao sistema')
  ).toBeInTheDocument()
  expect(
    await screen.findByRole('region', { name: 'Antigravity' })
  ).toBeInTheDocument()
  expect(screen.getAllByText('Sessões indisponíveis')).toHaveLength(3)
})

it('does not show stale process presence after discovery fails', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 1,
        revision: 1,
        observedAt: 1000,
        error: null,
        applications: [
          { agent: 'chatgpt', running: true },
          { agent: 'opencode', running: true },
          { agent: 'antigravity', running: true }
        ]
      }}
      error="Access denied"
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
  expect(screen.queryByText('Processo detectado')).not.toBeInTheDocument()
  expect(screen.getAllByText('Detecção indisponível')).toHaveLength(3)
})
