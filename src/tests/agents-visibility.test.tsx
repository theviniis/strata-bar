import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { AgentsPopupContent } from '@/features/agents/AgentsPopup'
import { defaultConfig, parseConfig } from '@/services/configuration/config'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { useConfig } from '@/stores/config'

function reset() {
  localStorage.clear()
  useConfig.setState({ config: defaultConfig, error: null })
}
beforeEach(reset)
afterEach(reset)

it('defaults legacy configurations to the existing agent visibility', () => {
  const { agents: _agents, ...legacy } = defaultConfig
  expect(parseConfig(JSON.stringify(legacy)).agents.visible).toEqual(
    defaultConfig.agents.visible
  )
})

it('consumes saved visibility changes without offering popup preferences', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Selecionar agentes' })
  ).not.toBeInTheDocument()
  const config = structuredClone(defaultConfig)
  config.agents.visible.chatgpt = false
  act(() => useConfig.setState({ config }))
  expect(
    screen.queryByRole('tab', { name: 'ChatGPT Desktop' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'OpenCode' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  act(() =>
    useConfig.setState({
      config: {
        ...config,
        agents: {
          visible: {
            chatgpt: false,
            opencode: false,
            codex: false,
            antigravity: false
          }
        }
      }
    })
  )
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(
    screen.getByText(/Nenhum agente selecionado.*Configurações → Agentes/)
  ).toBeInTheDocument()
})

it('hides alerts for hidden agents without deleting their pending alerts', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  snapshot.alerts.items = [
    {
      id: 'agent-alert-1',
      agent: 'opencode',
      sessionId: 'ses_one',
      sessionTitle: 'Alerta preservado',
      kind: 'attention',
      createdAt: 1000
    }
  ]
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  expect(screen.getByText('Alerta preservado')).toBeInTheDocument()
  const config = structuredClone(defaultConfig)
  config.agents.visible.opencode = false
  act(() => useConfig.setState({ config }))
  expect(screen.queryByText('Alerta preservado')).not.toBeInTheDocument()
  act(() => useConfig.setState({ config: defaultConfig }))
  expect(screen.getByText('Alerta preservado')).toBeInTheDocument()
  expect(snapshot.alerts.items).toHaveLength(1)
  fireEvent.click(screen.getByRole('tab', { name: 'OpenCode' }))
  expect(
    screen.queryByRole('button', { name: /Conectar OpenCode/ })
  ).not.toBeInTheDocument()
})
