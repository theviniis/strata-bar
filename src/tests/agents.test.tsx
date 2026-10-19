import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { AgentsPopup, AgentsPopupContent } from '@/features/agents/AgentsPopup'
import { PopupContext } from '@/popups/context'
import { OpenCodeSessions } from '@/features/agents/OpenCodeSessions'
import type { CreateAgentSessionResult } from '@/services/system/agents'

it('distinguishes detected applications from unavailable session control', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 4,
        antigravity: { status: 'disabled', sessions: [], error: null },
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
  expect(
    screen.getByRole('button', { name: 'Ativar hooks do Antigravity' })
  ).toBeInTheDocument()
})

it('activates Antigravity hooks without claiming discovery of previous sessions', async () => {
  render(
    <PopupContext.Provider
      value={{ mode: 'demo', id: 'agents', params: {}, close: () => {} }}
    >
      <AgentsPopup />
    </PopupContext.Provider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /^Antigravity/ }))
  expect(
    screen.getByText(/Somente sessões que emitirem eventos após a conexão/)
  ).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Ativar hooks do Antigravity' })
  )
  expect(
    await screen.findByText('Aguardando eventos do Antigravity')
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('list', { name: 'Sessões do Antigravity' })
  ).not.toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('button', { name: 'Desativar hooks do Antigravity' })
  )
  expect(
    await screen.findByRole('button', { name: 'Ativar hooks do Antigravity' })
  ).toBeInTheDocument()
})

it('does not show stale process presence after discovery fails', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 4,
        antigravity: { status: 'disabled', sessions: [], error: null },
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

it('connects and disconnects OpenCode inside its accordion', async () => {
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
  expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar OpenCode' }))
  await screen.findByRole('button', { name: 'Conectar OpenCode' })
  expect(screen.queryByText('Exemplo de sessão')).not.toBeInTheDocument()
})

it('blocks creating while pending or disconnected and keeps ambiguous failures visible without retry', async () => {
  let fail: ((error: Error) => void) | undefined
  const onCreate = vi.fn(
    () =>
      new Promise<CreateAgentSessionResult>((_, reject) => {
        fail = reject
      })
  )
  const connection = {
    status: 'connected' as const,
    sessions: [],
    hasMore: false,
    error: null
  }
  const { rerender } = render(
    <OpenCodeSessions connection={connection} onCreate={onCreate} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText('Pasta do projeto'), {
    target: { value: 'D:\\project' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conversa vazia' }))
  expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled()
  fail!(new Error('Confira a lista antes de tentar novamente'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Confira a lista')
  rerender(
    <OpenCodeSessions connection={connection} onCreate={onCreate} stale />
  )
  expect(
    screen.getByRole('button', { name: 'Criar conversa vazia' })
  ).toBeDisabled()
  expect(onCreate).toHaveBeenCalledExactlyOnceWith('D:\\project', undefined)
})

it('creates an empty OpenCode conversation in the chosen folder through the popup', async () => {
  render(
    <PopupContext.Provider
      value={{ mode: 'demo', id: 'agents', params: {}, close: () => {} }}
    >
      <AgentsPopup />
    </PopupContext.Provider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /^OpenCode/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Conectar OpenCode' }))
  await screen.findByText('Exemplo de sessão')
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText('Pasta do projeto'), {
    target: { value: 'C:\\Projetos\\novo' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conversa vazia' }))
  expect(await screen.findByText(/Conversa criada:/)).toBeInTheDocument()
  expect(await screen.findByText('Nova conversa')).toBeInTheDocument()
  expect(screen.getByText('C:\\Projetos\\novo')).toBeInTheDocument()
})

it('admits an optional initial prompt without reporting the task as completed', async () => {
  render(
    <PopupContext.Provider
      value={{ mode: 'demo', id: 'agents', params: {}, close: () => {} }}
    >
      <AgentsPopup />
    </PopupContext.Provider>
  )
  fireEvent.click(await screen.findByRole('button', { name: /^OpenCode/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Conectar OpenCode' }))
  await screen.findByText('Exemplo de sessão')
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText('Pasta do projeto'), {
    target: { value: 'C:\\Projetos\\novo' }
  })
  fireEvent.change(screen.getByLabelText('Prompt inicial (opcional)'), {
    target: { value: 'Leia o README' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar prompt' }))
  expect(
    await screen.findByText(
      'Prompt aceito pelo OpenCode. Acompanhe o andamento na lista.'
    )
  ).toBeInTheDocument()
  expect(screen.getByText(/Conversa criada:/)).toBeInTheDocument()
  expect(screen.queryByText('Concluído')).not.toBeInTheDocument()
})

it('keeps the created conversation visible when prompt admission is uncertain and never recreates it on reconnect', async () => {
  const onCreate = vi.fn(async () => ({
    sessionId: 'ses_partial',
    promptStatus: 'unknown' as const,
    error: 'Não reenvie: confira a conversa no OpenCode.'
  }))
  const connection = {
    status: 'connected' as const,
    sessions: [],
    hasMore: false,
    error: null
  }
  const { rerender } = render(
    <OpenCodeSessions connection={connection} onCreate={onCreate} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText('Pasta do projeto'), {
    target: { value: 'D:\\project' }
  })
  fireEvent.change(screen.getByLabelText('Prompt inicial (opcional)'), {
    target: { value: 'Leia' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar e enviar prompt' }))
  expect(
    await screen.findByText('Conversa criada: ses_partial')
  ).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Não reenvie')
  expect(
    screen.queryByLabelText('Prompt inicial (opcional)')
  ).not.toBeInTheDocument()
  rerender(
    <OpenCodeSessions connection={connection} onCreate={onCreate} stale />
  )
  rerender(<OpenCodeSessions connection={connection} onCreate={onCreate} />)
  expect(onCreate).toHaveBeenCalledExactlyOnceWith('D:\\project', 'Leia')
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
