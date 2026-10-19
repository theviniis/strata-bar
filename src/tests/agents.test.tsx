import { fireEvent, render, screen, within } from '@testing-library/react'
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
  const trigger = screen.getByRole('button', { name: /^ChatGPT Desktop/ })
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(within(trigger).getByText('Processo detectado')).toBeInTheDocument()
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const chatgpt = within(
    screen.getByRole('region', { name: /^ChatGPT Desktop/ })
  )
  expect(chatgpt.getByText('Sessões indisponíveis')).toBeInTheDocument()
  expect(chatgpt.getByRole('button', { name: 'Nova sessão' })).toBeDisabled()
  expect(
    within(screen.getByRole('button', { name: /^OpenCode/ })).getByText(
      'Processo não detectado'
    )
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^OpenCode/ }))
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  expect(screen.getByRole('region', { name: /^OpenCode/ })).toBeInTheDocument()
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
  const antigravity = await screen.findByRole('button', {
    name: /^Antigravity/
  })
  expect(antigravity).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByText('Sessões indisponíveis')).not.toBeInTheDocument()
  fireEvent.click(antigravity)
  expect(screen.getByText('Sessões indisponíveis')).toBeInTheDocument()
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
