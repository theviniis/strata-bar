import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Agents } from '@/features/agents/Agents'
import { AgentsController } from '@/features/agents/AgentsController'
import { AgentQuestion } from '@/features/agents/AgentQuestion'
import { AgentPermissionCard } from '@/features/agents/AgentPermissionCard'
import { AgentAlerts } from '@/features/agents/AgentAlerts'
import { AgentsPopup } from '@/features/agents/agents.popup'
import {
  agentsFixture,
  agentQuestionFixture,
  agentPermissionFixture
} from '@/features/agents/fixtures'
import { WidgetPreviewContext } from '@/components/status-bar/widget-preview-context'
import type { AgentsSnapshot } from '@/services/system/agents.generated'
const runtime = vi.hoisted(() => ({ connect: vi.fn(), dispose: vi.fn() }))
vi.mock('@/stores/agents', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/agents')>()
  const { create } = await import('zustand')
  const store = create<{
    snapshot: AgentsSnapshot | null
    connect: () => () => void
  }>(() => ({
    snapshot: null,
    connect: () => {
      runtime.connect()
      return runtime.dispose
    }
  }))
  return { ...original, getAgentsStore: () => store }
})
afterEach(() => {
  runtime.connect.mockClear()
  runtime.dispose.mockClear()
})
it('renders agent count and forwards trigger attributes, refs and callbacks only from props', () => {
  const click = vi.fn()
  const ref = vi.fn()
  const view = render(
    <Agents
      count={3}
      paused={false}
      describedBy="tip"
      ref={ref}
      onClick={click}
    />
  )
  const button = screen.getByRole('button', {
    name: 'Abrir agentes de IA, 3 alertas'
  })
  expect(ref).toHaveBeenCalledWith(button)
  expect(button).toHaveAttribute('aria-describedby', 'tip')
  fireEvent.click(button)
  expect(click).toHaveBeenCalledOnce()
  view.rerender(<Agents count={0} paused describedBy={undefined} />)
  expect(screen.queryByLabelText('Alertas de agentes')).not.toBeInTheDocument()
  expect(runtime.connect).not.toHaveBeenCalled()
})
it('renders question values, pending and errors from the controller props', () => {
  const change = vi.fn()
  const submit = vi.fn((event) => event.preventDefault())
  const props = {
    question: agentQuestionFixture(),
    answers: new Map([['path', 'src/']]),
    pending: false,
    attempted: false,
    error: null,
    blocked: false,
    valid: true,
    onSubmit: submit,
    onAnswerChange: change
  }
  const view = render(<AgentQuestion {...props} />)
  expect(screen.getByLabelText('Caminho')).toHaveValue('src/')
  fireEvent.change(screen.getByLabelText('Caminho'), {
    target: { value: 'docs/' }
  })
  expect(change).toHaveBeenCalledWith('path', 'docs/')
  expect(screen.getByLabelText('Caminho')).toHaveValue('src/')
  fireEvent.submit(screen.getByRole('form'))
  expect(submit).toHaveBeenCalledOnce()
  view.rerender(
    <AgentQuestion
      {...props}
      answers={new Map([['path', 'docs/']])}
      pending
      blocked
    />
  )
  expect(screen.getByLabelText('Caminho')).toHaveValue('docs/')
  expect(
    screen.getByRole('button', { name: 'Enviando resposta…' })
  ).toBeDisabled()
  view.rerender(
    <AgentQuestion
      {...props}
      blocked
      attempted
      error="Resposta sem confirmação"
    />
  )
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Resposta sem confirmação'
  )
  expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeDisabled()
})
it('reports explicit permission decisions and exposes controlled pending state', () => {
  const decide = vi.fn()
  const props = {
    permission: agentPermissionFixture(),
    pending: false,
    attempted: false,
    error: null,
    blocked: false,
    onDecision: decide
  }
  const view = render(<AgentPermissionCard {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar uma vez' }))
  expect(decide).toHaveBeenCalledWith('approveOnce')
  fireEvent.click(screen.getByRole('button', { name: 'Recusar' }))
  expect(decide).toHaveBeenCalledWith('reject')
  view.rerender(<AgentPermissionCard {...props} pending blocked />)
  expect(screen.getByRole('status')).toHaveTextContent('Enviando decisão')
  expect(screen.getByRole('button', { name: 'Aprovar uma vez' })).toBeDisabled()
})
it('uses supplied alert times and only dismisses displayed IDs', () => {
  const dismiss = vi.fn()
  render(
    <AgentAlerts
      alerts={agentsFixture().alerts}
      notifications={undefined}
      times={{ alert_demo: { iso: '2023-11-14T22:13:20.000Z', text: '19:13' } }}
      pending={false}
      error={null}
      onDismiss={dismiss}
    />
  )
  expect(screen.getByText('19:13')).toHaveAttribute(
    'dateTime',
    '2023-11-14T22:13:20.000Z'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar exibidos' }))
  expect(dismiss).toHaveBeenCalledWith(['alert_demo'])
})
it('keeps the agent tab controlled by props', async () => {
  const snapshot = agentsFixture()
  const select = vi.fn()
  const props = {
    snapshot,
    error: null,
    demo: false,
    applications: snapshot.applications,
    activeAgent: 'chatgpt' as const,
    alerts: null,
    sessions: { opencode: <p>Conteúdo OpenCode</p> },
    onAgentChange: select
  }
  const view = render(<AgentsPopup {...props} />)
  fireEvent.click(screen.getByRole('tab', { name: 'OpenCode' }))
  expect(select).toHaveBeenCalledWith('opencode')
  expect(screen.getByRole('tab', { name: 'ChatGPT Desktop' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  view.rerender(<AgentsPopup {...props} activeAgent="opencode" />)
  await waitFor(() => {
    expect(screen.getByText('Conteúdo OpenCode')).toBeVisible()
  })
})
it('connects once per active controller and disposes on unmount', () => {
  const view = render(<AgentsController />)
  expect(runtime.connect).toHaveBeenCalledOnce()
  view.unmount()
  expect(runtime.dispose).toHaveBeenCalledOnce()
})
it('renders the same agent visual in inert preview without connecting', () => {
  render(
    <WidgetPreviewContext value={true}>
      <AgentsController />
    </WidgetPreviewContext>
  )
  expect(
    screen.getByRole('button', { name: 'Abrir agentes de IA' })
  ).toBeVisible()
  expect(runtime.connect).not.toHaveBeenCalled()
})
