import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { AgentsPopup, AgentsPopupContent } from '@/features/agents/AgentsPopup'
import { PopupContext } from '@/popups/context'
import { OpenCodeSessions } from '@/features/agents/OpenCodeSessions'

it('distinguishes detected applications from unavailable session control', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 2,
        opencode: {
          status: 'disabled',
          sessions: [],
          hasMore: false,
          error: null
        },
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
        version: 2,
        opencode: {
          status: 'disabled',
          sessions: [],
          hasMore: false,
          error: null
        },
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

it('connects and disconnects OpenCode inside its accordion without enabling session actions', async () => {
  render(
    <PopupContext.Provider
      value={{ mode: 'demo', id: 'agents', params: {}, close: () => {} }}
    >
      <AgentsPopup />
    </PopupContext.Provider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /^OpenCode/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Conectar OpenCode' }))
  expect(await screen.findByText('Exemplo de sessão')).toBeInTheDocument()
  expect(screen.getByText('Em execução')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar OpenCode' }))
  await screen.findByRole('button', { name: 'Conectar OpenCode' })
  expect(screen.queryByText('Exemplo de sessão')).not.toBeInTheDocument()
})

it('shows attention and history limits, then marks sessions disconnected on a transport error', () => {
  const connection = {
    status: 'connected' as const,
    error: null,
    hasMore: true,
    sessions: [
      {
        id: 'ses_pending',
        agent: 'opencode' as const,
        connectionId: 'opencode-local',
        title: 'Review changes',
        directory: 'D:\\project',
        status: 'attention' as const,
        updatedAt: 1000
      }
    ]
  }
  const view = render(<OpenCodeSessions connection={connection} />)
  expect(screen.getByText('Atenção necessária')).toBeInTheDocument()
  expect(screen.getByText(/Há mais histórico no OpenCode/)).toBeInTheDocument()
  view.rerender(<OpenCodeSessions connection={connection} stale />)
  expect(screen.getByText('Desconectada')).toBeInTheDocument()
  expect(screen.queryByText('Atenção necessária')).not.toBeInTheDocument()
})
