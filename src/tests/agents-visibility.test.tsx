import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AgentsPopupContent } from '@/features/agents/AgentsPopup'
import {
  defaultConfig,
  parseConfig,
  storageKey
} from '@/services/configuration/config'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { loadConfig, useConfig, watchConfig } from '@/stores/config'

function reset() {
  localStorage.clear()
  useConfig.setState({ config: defaultConfig, error: null })
}
beforeEach(reset)
afterEach(reset)

it('defaults legacy configurations and persists visibility across reload and windows', () => {
  const { agents: _agents, ...legacy } = defaultConfig
  expect(parseConfig(JSON.stringify(legacy)).agents.visible).toEqual(
    defaultConfig.agents.visible
  )
  expect(useConfig.getState().setAgentVisible('codex', false)).toBe(true)
  useConfig.setState({ config: defaultConfig })
  loadConfig()
  expect(useConfig.getState().config.agents.visible.codex).toBe(false)
  const stop = watchConfig()
  const next = structuredClone(defaultConfig)
  next.agents.visible.chatgpt = false
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: storageKey,
      newValue: JSON.stringify(next)
    })
  )
  expect(useConfig.getState().config.agents.visible.chatgpt).toBe(false)
  stop()
})

it('selects visible agents, switches away from a hidden active tab, and keeps settings available when none remain', async () => {
  const snapshot = await createDemoAgentsAdapter().load()
  render(<AgentsPopupContent snapshot={snapshot} error={null} />)
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar agentes' }))
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar ChatGPT Desktop' })
  )
  expect(
    screen.queryByRole('tab', { name: 'ChatGPT Desktop' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'OpenCode' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  for (const name of ['OpenCode', 'Antigravity', 'Codex local']) {
    fireEvent.click(screen.getByRole('checkbox', { name: `Mostrar ${name}` }))
  }
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  expect(screen.getByText('Nenhum agente selecionado.')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar Antigravity' }))
  expect(screen.getByRole('tab', { name: 'Antigravity' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(
    JSON.parse(localStorage.getItem(storageKey)!).agents.visible.codex
  ).toBe(false)
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
  fireEvent.click(screen.getByRole('button', { name: 'Selecionar agentes' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar OpenCode' }))
  expect(screen.queryByText('Alerta preservado')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar OpenCode' }))
  expect(screen.getByText('Alerta preservado')).toBeInTheDocument()
  expect(snapshot.alerts.items).toHaveLength(1)
})

it('keeps the prior visibility when saving fails', () => {
  const save = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementationOnce(() => {
      throw new Error('Storage unavailable')
    })
  try {
    expect(useConfig.getState().setAgentVisible('codex', false)).toBe(false)
    expect(useConfig.getState().config.agents.visible.codex).toBe(true)
    expect(useConfig.getState().error).toBe('Storage unavailable')
  } finally {
    save.mockRestore()
  }
})
