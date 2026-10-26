import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  AgentsPopupController as AgentsPopup,
  AgentsPopupStateController as AgentsPopupContent
} from '@/features/agents/AgentsPopupController'
import { PopupContext } from '@/popups/context'
import { OpenCodeSessionsController as OpenCodeSessions } from '@/features/agents/OpenCodeSessionsController'
import type { CreateAgentSessionResult } from '@/services/system/agents'
import type { AgentMessage } from '@/services/system/agents'
import { AgentQuestionController as AgentQuestion } from '@/features/agents/AgentQuestionController'
import { AgentPermissionCardController as AgentPermissionCard } from '@/features/agents/AgentPermissionCardController'
import type {
  AgentPermission,
  OpenCodeSnapshot
} from '@/services/system/agents'
import { AgentAlertsController as AgentAlerts } from '@/features/agents/AgentAlertsController'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { AgentAlertCount } from '@/features/agents/Agents'
import { defaultConfig } from '@/services/configuration/config'
import { useConfig } from '@/stores/config'

const initialConfig = useConfig.getState().config
beforeEach(() =>
  useConfig.setState({
    config: {
      ...defaultConfig,
      agents: {
        visible: {
          chatgpt: true,
          opencode: true,
          antigravity: true,
          codex: true
        }
      }
    }
  })
)
afterEach(() => useConfig.setState({ config: initialConfig }))

it.each(['', 'Responda OK'])(
  'creates without a project folder with optional prompt %s',
  async (prompt) => {
    const onCreate = vi.fn(async () => ({
      sessionId: 'ses_no_folder',
      promptStatus: 'notRequested' as const,
      error: null
    }))
    render(
      <OpenCodeSessions
        connection={{
          status: 'connected',
          sessions: [],
          questions: [],
          permissions: [],
          completedTurns: {},
          hasMore: false,
          error: null
        }}
        onCreate={onCreate}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
    expect(screen.getByLabelText(/Pasta do projeto/)).not.toBeRequired()
    if (prompt)
      fireEvent.change(screen.getByLabelText('Prompt inicial (opcional)'), {
        target: { value: prompt }
      })
    const submit = screen.getByRole('button', {
      name: prompt ? 'Criar e enviar prompt' : 'Criar conversa vazia'
    })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)
    await vi.waitFor(() =>
      expect(onCreate).toHaveBeenCalledExactlyOnceWith(
        undefined,
        prompt || undefined
      )
    )
  }
)

it('shows unread counts without an open popup and exposes capacity limits', () => {
  const { rerender } = render(<AgentAlertCount count={3} />)
  expect(screen.getByLabelText('Alertas de agentes')).toHaveTextContent('3')
  rerender(<AgentAlertCount count={0} />)
  expect(screen.queryByLabelText('Alertas de agentes')).not.toBeInTheDocument()
  rerender(
    <AgentAlerts alerts={{ items: [], overflowCount: 2, paused: true }} />
  )
  expect(screen.getByText(/2 alertas anteriores/)).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Novos alertas pausados')
})

it('shows attention and completion alerts and dismisses only the IDs currently displayed', async () => {
  const onDismiss = vi.fn(async () => {})
  render(
    <AgentAlerts
      alerts={{
        items: [
          {
            id: 'agent-alert-1',
            agent: 'opencode',
            sessionId: 'ses_test',
            sessionTitle: 'Projeto A',
            kind: 'attention',
            createdAt: 1000
          },
          {
            id: 'agent-alert-2',
            agent: 'antigravity',
            sessionId: '11111111-1111-1111-1111-111111111111',
            sessionTitle: 'Projeto B',
            kind: 'completed',
            createdAt: 2000
          }
        ],
        overflowCount: 0,
        paused: false
      }}
      onDismiss={onDismiss}
    />
  )
  expect(screen.getByText('OpenCode · Atenção necessária')).toBeInTheDocument()
  expect(screen.getByText('Antigravity · Turno concluído')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar exibidos' }))
  await vi.waitFor(() =>
    expect(onDismiss).toHaveBeenCalledExactlyOnceWith([
      'agent-alert-1',
      'agent-alert-2'
    ])
  )
})

const pendingPermission: AgentPermission = {
  id: 'per_test',
  sessionId: 'ses_busy',
  version: 'b'.repeat(64),
  action: 'shell',
  resources: ['echo Strata'],
  details: '{"metadata":{"command":"echo Strata"}}',
  unsupportedReason: null,
  replyBlocked: false
}
const permissionConnection: OpenCodeSnapshot = {
  status: 'connected',
  error: null,
  hasMore: false,
  questions: [],
  completedTurns: {},
  permissions: [pendingPermission],
  sessions: [
    {
      id: 'ses_busy',
      agent: 'opencode',
      connectionId: 'opencode-local',
      title: 'Projeto',
      directory: 'D:\\project',
      status: 'attention',
      updatedAt: 1000
    }
  ]
}

it('blocks decisions on stale or incomplete context and does not replay an uncertain refusal', async () => {
  const onDecision = vi.fn(async () => {
    throw new Error('Decisão sem confirmação; confira o OpenCode')
  })
  const { rerender } = render(
    <AgentPermissionCard
      permission={pendingPermission}
      disabled
      onDecision={onDecision}
    />
  )
  expect(screen.getByRole('button', { name: 'Aprovar uma vez' })).toBeDisabled()
  rerender(
    <AgentPermissionCard
      permission={{
        ...pendingPermission,
        unsupportedReason: 'Contexto grande demais; decida no OpenCode.'
      }}
      disabled={false}
      onDecision={onDecision}
    />
  )
  expect(
    screen.getByText('Contexto grande demais; decida no OpenCode.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled()
  rerender(
    <AgentPermissionCard
      permission={pendingPermission}
      disabled={false}
      onDecision={onDecision}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Decisão sem confirmação'
  )
  rerender(
    <AgentPermissionCard
      permission={pendingPermission}
      disabled
      onDecision={onDecision}
    />
  )
  rerender(
    <AgentPermissionCard
      permission={pendingPermission}
      disabled={false}
      onDecision={onDecision}
    />
  )
  expect(screen.getByRole('button', { name: 'Aprovar uma vez' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled()
  expect(onDecision).toHaveBeenCalledTimes(1)
})

it.each([
  ['approveOnce', 'Aprovar uma vez'],
  ['reject', 'Recusar']
] as const)(
  'requires an explicit %s decision after showing the pending operation',
  async (decision, label) => {
    const onDecision = vi.fn(async () => {})
    render(
      <OpenCodeSessions
        connection={permissionConnection}
        onDecision={onDecision}
      />
    )
    expect(screen.getByText('echo Strata')).toBeInTheDocument()
    expect(screen.getByText(/"command":"echo Strata"/)).toBeInTheDocument()
    expect(onDecision).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(
      await screen.findByText(
        'Decisão enviada. Acompanhe o andamento no OpenCode.'
      )
    ).toBeInTheDocument()
    expect(onDecision).toHaveBeenCalledExactlyOnceWith({
      sessionId: 'ses_busy',
      permissionId: 'per_test',
      version: 'b'.repeat(64),
      decision
    })
    expect(
      screen.getByRole('button', { name: 'Aprovar uma vez' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Recusar' })).toBeDisabled()
  }
)

const pendingQuestion: AgentMessage = {
  id: 'frm_text',
  sessionId: 'ses_busy',
  connectionId: 'opencode-local',
  version: 'a'.repeat(64),
  title: 'Qual nome usar?',
  fields: [
    {
      key: 'name',
      title: 'Nome',
      description: 'Nome do projeto',
      required: true,
      minLength: 1,
      maxLength: 100
    }
  ],
  unsupportedReason: null,
  replyBlocked: false
}

it('answers a pending textual question in its session card and blocks a duplicate submission', async () => {
  const onReply = vi.fn(async () => {})
  render(
    <OpenCodeSessions
      connection={{
        status: 'connected',
        error: null,
        hasMore: false,
        completedTurns: {},
        permissions: [],
        questions: [pendingQuestion],
        sessions: [
          {
            id: 'ses_busy',
            agent: 'opencode',
            connectionId: 'opencode-local',
            title: 'Projeto',
            directory: 'D:\\project',
            status: 'attention',
            updatedAt: 1000
          }
        ]
      }}
      onReply={onReply}
    />
  )
  expect(screen.getByText('Qual nome usar?')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Nome'), {
    target: { value: 'Strata' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }))
  expect(
    await screen.findByText(
      'Resposta enviada. Acompanhe o andamento no OpenCode.'
    )
  ).toBeInTheDocument()
  expect(onReply).toHaveBeenCalledExactlyOnceWith({
    sessionId: 'ses_busy',
    questionId: 'frm_text',
    version: 'a'.repeat(64),
    answers: { name: 'Strata' }
  })
  expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
})

it('disables stale questions and retains an uncertain submission without replay on reconnect', async () => {
  const onReply = vi.fn(async () => {
    throw new Error('Envio sem confirmação. Confira o OpenCode.')
  })
  const { rerender } = render(
    <AgentQuestion question={pendingQuestion} disabled onReply={onReply} />
  )
  expect(screen.getByLabelText('Nome')).toBeDisabled()
  rerender(
    <AgentQuestion
      question={pendingQuestion}
      disabled={false}
      onReply={onReply}
    />
  )
  fireEvent.change(screen.getByLabelText('Nome'), {
    target: { value: 'Strata' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Enviar resposta' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Envio sem confirmação'
  )
  rerender(
    <AgentQuestion question={pendingQuestion} disabled onReply={onReply} />
  )
  rerender(
    <AgentQuestion
      question={pendingQuestion}
      disabled={false}
      onReply={onReply}
    />
  )
  expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
  expect(onReply).toHaveBeenCalledTimes(1)
})

it('identifies unsupported questions without presenting a generic answer or approval', () => {
  render(
    <AgentQuestion
      question={{
        ...pendingQuestion,
        fields: [],
        unsupportedReason: 'Responda este formulário no OpenCode.'
      }}
      disabled={false}
      onReply={vi.fn()}
    />
  )
  expect(
    screen.getByText('Responda este formulário no OpenCode.')
  ).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})

it('distinguishes detected applications from unavailable session control', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 9,
        notifications: { status: 'demo', skipped: 0 },
        alerts: { items: [], overflowCount: 0, paused: false },
        antigravity: { status: 'disabled', sessions: [], error: null },
        codex: { status: 'disabled', sessions: [], error: null },
        opencode: {
          status: 'disabled',
          sessions: [],
          completedTurns: {},
          permissions: [],
          questions: [],
          hasMore: false,
          error: null
        },
        revision: 1,
        observedAt: 1000,
        error: null,
        applications: [
          { agent: 'chatgpt', running: true },
          { agent: 'opencode', running: false },
          { agent: 'antigravity', running: true },
          { agent: 'codex', running: true }
        ]
      }}
      error={null}
    />
  )
  const trigger = screen.getByRole('tab', { name: /^ChatGPT Desktop/ })
  expect(trigger).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByRole('tabpanel')).toHaveTextContent('Processo detectado')
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-selected', 'true')
  const chatgpt = within(
    screen.getByRole('tabpanel', { name: /^ChatGPT Desktop/ })
  )
  expect(chatgpt.getByText('Sessões indisponíveis')).toBeInTheDocument()
  expect(chatgpt.getByRole('button', { name: 'Nova sessão' })).toBeDisabled()
  fireEvent.click(screen.getByRole('tab', { name: /^OpenCode/ }))
  expect(trigger).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByRole('tabpanel', { name: /^OpenCode/ })).toHaveTextContent(
    'Processo não detectado'
  )
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
  const antigravity = await screen.findByRole('tab', {
    name: /^Antigravity/
  })
  expect(antigravity).toHaveAttribute('aria-selected', 'false')
  expect(screen.getByText('Sessões indisponíveis')).toBeInTheDocument()
  fireEvent.click(antigravity)
  expect(
    screen.getByText(/Configure esta integração em Configurações → Agentes/)
  ).toBeInTheDocument()
})

it('guides Antigravity setup through Settings without a popup action', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  fireEvent.click(screen.getByRole('tab', { name: /^Antigravity/ }))
  expect(
    screen.getByText(/Configure esta integração em Configurações → Agentes/)
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /hooks/ })
  ).not.toBeInTheDocument()
})

it('does not show stale process presence after discovery fails', () => {
  render(
    <AgentsPopupContent
      snapshot={{
        version: 9,
        notifications: { status: 'demo', skipped: 0 },
        alerts: { items: [], overflowCount: 0, paused: false },
        antigravity: { status: 'disabled', sessions: [], error: null },
        codex: { status: 'disabled', sessions: [], error: null },
        opencode: {
          status: 'disabled',
          sessions: [],
          completedTurns: {},
          permissions: [],
          questions: [],
          hasMore: false,
          error: null
        },
        revision: 1,
        observedAt: 1000,
        error: null,
        applications: [
          { agent: 'chatgpt', running: true },
          { agent: 'opencode', running: true },
          { agent: 'antigravity', running: true },
          { agent: 'codex', running: true }
        ]
      }}
      error="Access denied"
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
  expect(screen.queryByText('Processo detectado')).not.toBeInTheDocument()
  expect(screen.getAllByText('Detecção indisponível')).toHaveLength(1)
})

it('guides OpenCode setup through Settings without connection controls', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  fireEvent.click(screen.getByRole('tab', { name: /^OpenCode/ }))
  expect(
    screen.getByText(/Configure esta integração em Configurações → Agentes/)
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: /Conectar OpenCode/ })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Nova sessão' })).toBeDisabled()
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
    completedTurns: {},
    permissions: [],
    questions: [],
    hasMore: false,
    error: null
  }
  const { rerender } = render(
    <OpenCodeSessions connection={connection} onCreate={onCreate} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText(/Pasta do projeto/), {
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
  const adapter = createDemoAgentsAdapter()
  const snapshot = await adapter.setOpenCode(true)
  render(
    <AgentsPopupContent
      snapshot={snapshot}
      error={null}
      onCreateOpenCode={(directory, prompt) =>
        adapter.createOpenCode(directory, prompt)
      }
    />
  )
  fireEvent.click(screen.getByRole('tab', { name: /^OpenCode/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText(/Pasta do projeto/), {
    target: { value: 'C:\\Projetos\\novo' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Criar conversa vazia' }))
  expect(await screen.findByText(/Conversa criada:/)).toBeInTheDocument()
})

it('admits an optional initial prompt without reporting the task as completed', async () => {
  const adapter = createDemoAgentsAdapter()
  const snapshot = await adapter.setOpenCode(true)
  render(
    <AgentsPopupContent
      snapshot={snapshot}
      error={null}
      onCreateOpenCode={(directory, prompt) =>
        adapter.createOpenCode(directory, prompt)
      }
    />
  )
  fireEvent.click(screen.getByRole('tab', { name: /^OpenCode/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText(/Pasta do projeto/), {
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
    completedTurns: {},
    permissions: [],
    questions: [],
    hasMore: false,
    error: null
  }
  const { rerender } = render(
    <OpenCodeSessions connection={connection} onCreate={onCreate} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Nova sessão' }))
  fireEvent.change(screen.getByLabelText(/Pasta do projeto/), {
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
    completedTurns: {},
    permissions: [],
    questions: [],
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
it('explains blocked native toasts while preserving the visual alert list', () => {
  render(
    <AgentAlerts
      alerts={{ items: [], overflowCount: 0, paused: false }}
      notifications={{ status: 'blocked', skipped: 1 }}
    />
  )
  expect(
    screen.getByText(/Windows bloqueou as notificações/)
  ).toBeInTheDocument()
  expect(
    screen.getByText(/1 notificações não foram enviadas/)
  ).toBeInTheDocument()
  expect(screen.getByText('Sem novos alertas.')).toBeInTheDocument()
})
