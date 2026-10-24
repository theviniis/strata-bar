import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SettingsMonitor } from '../services/system/config.generated'
import { configSchema, defaultConfig } from '../services/configuration/config'
import { bridge, connect } from '../services/system/bridge'
import { createAgentsStore } from '@/stores/agents'
import { createDemoAgentsAdapter } from '@/services/system/agents'
import { SettingsView } from '../settings/SettingsView'
import { rememberNavigation } from '../settings/navigation'

const calendarAccount = vi.hoisted(() => ({
  status: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn()
}))
vi.mock('@/services/system/calendar', () => ({ calendar: calendarAccount }))

let agentAdapter = createDemoAgentsAdapter()
let agentStore = createAgentsStore(agentAdapter)
vi.mock('@/stores/agents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/stores/agents')>()),
  getAgentsStore: () => agentStore
}))

const close = vi.hoisted(() => vi.fn())
const calendarEvents = vi.hoisted(() => ({
  listener: undefined as undefined | (() => void)
}))
const monitorEvents = vi.hoisted(() => ({
  listener: undefined as
    undefined | ((event: { payload: SettingsMonitor[] }) => void)
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (
      event: string,
      listener: (event: { payload: SettingsMonitor[] }) => void
    ) => {
      if (event === 'monitors:changed') monitorEvents.listener = listener
      if (event === 'calendar:changed')
        calendarEvents.listener = () => listener({ payload: [] })
      return () => {}
    }
  )
}))
// jsdom does not implement the browser geometry observer used by Slider.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
)
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ close })
}))
vi.mock('../services/system/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/system/bridge')>()),
  connect: vi.fn(),
  bridge: {
    mode: 'native',
    configLoad: vi.fn(),
    configSave: vi.fn(),
    settingsMonitors: vi.fn(),
    spotifyStatus: vi.fn(),
    spotifyConnect: vi.fn(),
    spotifyDisconnect: vi.fn(),
    spotifyOpenDashboard: vi.fn(),
    quit: vi.fn()
  }
}))

beforeEach(() => {
  agentAdapter = createDemoAgentsAdapter()
  agentStore = createAgentsStore(agentAdapter)
  localStorage.clear()
  vi.clearAllMocks()
  vi.mocked(bridge.spotifyConnect!).mockReset()
  vi.mocked(bridge.spotifyDisconnect!).mockReset()
  vi.mocked(bridge.spotifyStatus!).mockReset()
  monitorEvents.listener = undefined
  calendarEvents.listener = undefined
  vi.mocked(bridge.settingsMonitors!).mockResolvedValue([
    {
      id: 'screen-a',
      deviceName: 'DISPLAY1',
      name: 'Main',
      width: 1920,
      height: 1080,
      primary: true
    },
    {
      id: 'screen-b',
      deviceName: 'DISPLAY2',
      name: 'Side',
      width: 2560,
      height: 1440,
      primary: false
    }
  ])
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
  )
  vi.mocked(bridge.configLoad!).mockResolvedValue({
    config: structuredClone(defaultConfig),
    revision: 1,
    error: null
  })
  vi.mocked(bridge.configSave!).mockImplementation(async (config) => ({
    config: configSchema.parse(config),
    revision: 2,
    error: null
  }))
})

function openAudioOutput() {
  fireEvent.click(screen.getByRole('button', { name: 'Áudio' }))
}

async function openEditor() {
  render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
}

it('blocks editing and saving defaults after a failed initial load until Reverter succeeds', async () => {
  vi.mocked(bridge.configLoad!).mockRejectedValueOnce('Cannot read config')
  render(<SettingsView />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot read config'
  )
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  expect(
    screen.getByRole('button', { name: 'Restaurar padrões' })
  ).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  expect(screen.getByLabelText('Configuração JSON')).toBeDisabled()
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  expect(screen.getByLabelText('Configuração JSON')).toBeEnabled()
})

it('restores the last menu and monitor after reopening without saving the draft', async () => {
  const first = render(<SettingsView />)
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 1/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  first.unmount()

  const second = render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  expect(screen.getByRole('heading', { name: 'Aparência' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  expect(await screen.findByRole('tab', { name: /Monitor 1/ })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  second.unmount()

  await openEditor()
  expect(await screen.findByRole('tab', { name: /Monitor 1/ })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('remembers JSON and an explicit Todos selection across reopens', async () => {
  const first = render(<SettingsView />)
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 1/ }))
  fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  first.unmount()
  await openEditor()
  expect(
    screen.getByRole('textbox', { name: 'Configuração JSON' })
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  await screen.findByRole('tab', { name: /Monitor 1/ })
  expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
})

it('retains the remembered monitor through a failed discovery and restores it on retry', async () => {
  const first = render(<SettingsView />)
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 1/ }))
  first.unmount()
  vi.mocked(bridge.settingsMonitors!).mockRejectedValueOnce(
    new Error('Display query failed')
  )
  const second = render(<SettingsView />)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Display query failed'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(await screen.findByRole('tab', { name: /Monitor 1/ })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  second.unmount()
  vi.mocked(bridge.settingsMonitors!).mockResolvedValue([])
  await openEditor()
  expect(
    await screen.findByText(/O monitor selecionado foi desconectado/)
  ).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('removes a widget only from the selected monitor and restores it through the preview catalog', async () => {
  await openEditor()
  expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 2/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Remover CPU' }))
  const catalog = screen.getByRole('complementary', {
    name: 'Widgets disponíveis'
  })
  expect(within(catalog).getByTitle('cpu')).toBeInTheDocument()
  fireEvent.change(
    within(catalog).getByRole('textbox', { name: 'Buscar widgets' }),
    { target: { value: 'cpu' } }
  )
  fireEvent.click(
    within(catalog).getByRole('button', { name: 'Adicionar CPU' })
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Adicionar CPU em Centro' })
  )
  expect(
    within(catalog).queryByRole('button', { name: 'Adicionar CPU' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalled())
  const saved = vi.mocked(bridge.configSave!).mock.calls[0][0]
  expect(saved.monitors['screen-b']!.layout?.center).toEqual(['time', 'cpu'])
  expect(saved.widgets.right.filter((w) => w.type === 'cpu')).toHaveLength(1)
  expect(saved.monitors['screen-a']).toBeUndefined()
})

it('edits mixed widget fields globally without overwriting unrelated monitor values', async () => {
  const config = structuredClone(defaultConfig)
  config.monitors = {
    'screen-a': { widgets: { cpu: { intervalMs: 4000, tooltip: false } } },
    'screen-b': { widgets: { cpu: { intervalMs: 8000, tooltip: true } } },
    offline: { widgets: { cpu: { intervalMs: 12000, tooltip: false } } }
  }
  vi.mocked(bridge.configLoad!).mockResolvedValue({
    config,
    revision: 1,
    error: null
  })
  await openEditor()
  await screen.findByRole('tab', { name: /Monitor 2/ })
  fireEvent.click(screen.getByRole('button', { name: 'Configurar CPU' }))
  expect(
    screen.getByRole('checkbox', { name: 'Mostrar tooltip' })
  ).toHaveAttribute('data-state', 'indeterminate')
  const interval = screen.getByLabelText('Intervalo (ms)')
  expect(interval).toHaveValue(null)
  fireEvent.change(interval, { target: { value: '6000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalled())
  const saved = vi.mocked(bridge.configSave!).mock.calls[0][0]
  expect(saved.monitors['screen-a']!.widgets!.cpu).toEqual({
    intervalMs: 6000,
    tooltip: false
  })
  expect(saved.monitors['screen-b']!.widgets!.cpu).toEqual({
    intervalMs: 6000,
    tooltip: true
  })
  expect(saved.monitors.offline).toEqual(config.monitors.offline)
})

it('disables bars independently and globally while retaining the widget configuration', async () => {
  await openEditor()
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 2/ }))
  fireEvent.click(
    screen.getByRole('switch', { name: 'Habilitar barra neste monitor' })
  )
  expect(screen.getByRole('button', { name: 'Configurar CPU' })).toBeEnabled()
  fireEvent.click(screen.getByRole('tab', { name: 'Todos' }))
  expect(screen.getByText('Alguns monitores habilitados')).toBeInTheDocument()
  fireEvent.click(
    screen.getByRole('switch', {
      name: 'Habilitar barra em todos os monitores'
    })
  )
  fireEvent.click(
    screen.getByRole('switch', {
      name: 'Habilitar barra em todos os monitores'
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalled())
  const saved = vi.mocked(bridge.configSave!).mock.calls[0][0]
  expect(saved.bar.enabled).toBe(false)
  expect(saved.monitors['screen-a']!.enabled).toBe(false)
  expect(saved.monitors['screen-b']!.enabled).toBe(false)
  expect(saved.widgets).toEqual(defaultConfig.widgets)
})

it('returns to Todos after a selected connected monitor disappears and preserves its draft', async () => {
  await openEditor()
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 2/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar CPU' }))
  await waitFor(() => expect(monitorEvents.listener).toBeDefined())
  const { act } = await import('@testing-library/react')
  await act(async () =>
    monitorEvents.listener!({
      payload: [
        {
          id: 'screen-a',
          deviceName: 'DISPLAY1',
          name: 'Main',
          width: 1920,
          height: 1080,
          primary: true
        }
      ]
    })
  )
  expect(screen.getByRole('tab', { name: 'Todos' })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  expect(
    screen.getByText(/O monitor selecionado foi desconectado/)
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalled())
  expect(
    vi.mocked(bridge.configSave!).mock.calls[0][0].monitors['screen-b']!
      .widgets!.cpu!.enabled
  ).toBe(false)
})

it('retries failed native monitor discovery without substituting demo monitors', async () => {
  vi.mocked(bridge.settingsMonitors!).mockRejectedValueOnce(
    new Error('Display query failed')
  )
  await openEditor()
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Display query failed'
  )
  expect(
    screen.queryByRole('tab', { name: /Demonstração/ })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
  expect(
    await screen.findByRole('tab', { name: /Monitor 2/ })
  ).toBeInTheDocument()
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('loads the saved configuration and applies the edited layout through native save', async () => {
  await openEditor()
  await screen.findByRole('tab', { name: /Monitor 2/ })
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  await screen.findByRole('tab', { name: /Monitor 2/ })
  fireEvent.click(screen.getByRole('button', { name: 'Mover CPU para Centro' }))
  fireEvent.click(
    screen.getByRole('button', { name: 'Mover CPU para Esquerda' })
  )
  expect(
    within(screen.getByRole('region', { name: 'Seção Esquerda' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalledOnce())
  const saved = vi.mocked(bridge.configSave!).mock.calls[0][0]
  expect(saved.monitors['screen-a']!.layout!.left).toContain('cpu')
  expect(saved.monitors['screen-b']!.layout!.left).toContain('cpu')
  expect(vi.mocked(bridge.configSave!).mock.calls[0][0]).toMatchObject({
    bar: { theme: 'light' },
    widgets: {
      left: expect.arrayContaining([expect.objectContaining({ id: 'cpu' })])
    }
  })
})

it('moves with an arrow only in the selected monitor until Apply', async () => {
  await openEditor()
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 2/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Mover CPU para Centro' }))
  expect(
    screen.getByRole('button', { name: 'Mover CPU para Esquerda' })
  ).toHaveFocus()
  expect(bridge.configSave).not.toHaveBeenCalled()
  expect(
    within(screen.getByRole('region', { name: 'Seção Centro' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeChecked()
  fireEvent.click(screen.getByRole('tab', { name: /Monitor 1/ }))
  expect(
    within(screen.getByRole('region', { name: 'Seção Direita' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeChecked()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalledOnce())
  const saved = vi.mocked(bridge.configSave!).mock.calls[0][0]
  expect(saved.widgets).toEqual(defaultConfig.widgets)
  expect(saved.monitors['screen-b']!.layout!.center).toEqual(['time', 'cpu'])
  expect(saved.monitors['screen-a']).toBeUndefined()
})

it('reverts by reloading the saved file and restores defaults only after Apply', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Escuro' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  expect(bridge.configLoad).toHaveBeenCalledTimes(2)
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(defaultConfig)
  )
})

it('explains that Revert did not save and clears the notice after Apply', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  const notice = await screen.findByText(/Nenhuma alteração foi salva/)
  expect(notice).toHaveTextContent('Clique em Aplicar para salvar e aplicar')
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalledOnce())
  await waitFor(() =>
    expect(
      screen.queryByText(/Nenhuma alteração foi salva/)
    ).not.toBeInTheDocument()
  )
})

it('shows a native rejection in the validation alert and blocks Apply until edited', async () => {
  await openEditor()
  vi.mocked(bridge.configSave!).mockRejectedValueOnce('Disk full')
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
})

it('shows one section at a time and preserves the draft across sidebar navigation', async () => {
  await openEditor()
  expect(
    screen.getByRole('heading', { name: 'Editor de Layout' })
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('heading', { name: 'Aparência' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  expect(screen.getByRole('button', { name: 'Aparência' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  expect(
    screen.queryByRole('heading', { name: 'Editor de Layout' })
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('closes only the settings window', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(bridge.quit).not.toHaveBeenCalled()
})

it('previews the draft NativeBar layout in all palettes without native subscriptions', async () => {
  const config = structuredClone(defaultConfig)
  const cpu = Object.values(config.widgets)
    .flat()
    .find((widget) => widget.type === 'cpu')!
  for (const section of ['left', 'center', 'right'] as const)
    config.widgets[section] = config.widgets[section].filter(
      (widget) => widget !== cpu
    )
  config.widgets.left.push(cpu)
  vi.mocked(bridge.configLoad!).mockResolvedValueOnce({
    config,
    revision: 1,
    error: null
  })
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  for (const name of [
    'Illusion (Refined)',
    'AMOLED',
    'Nord',
    'Dracula',
    'Catppuccin'
  ]) {
    const choice = screen.getByRole('button', { name })
    const preview = choice.querySelector('[data-theme-preview]')!
    expect(preview).toHaveAttribute('inert')
    const cpu = within(preview as HTMLElement).getByLabelText(
      'Detalhes da CPU',
      { selector: 'button' }
    )
    expect(cpu).toHaveTextContent('17.0%')
    expect(cpu.closest('[data-section]')).toHaveAttribute(
      'data-section',
      'left'
    )
    expect(preview.querySelector('.native-bar')).toBeNull()
  }
  expect(connect).not.toHaveBeenCalled()
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('saves the chosen palette only on Apply and restores the saved palette after rejection', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Nord' }))
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: expect.objectContaining({ colorTheme: 'nord', theme: 'dark' })
      })
    )
  )
  vi.mocked(bridge.configLoad!).mockResolvedValueOnce({
    config: {
      ...defaultConfig,
      bar: { ...defaultConfig.bar, colorTheme: 'nord' }
    },
    revision: 2,
    error: null
  })
  vi.mocked(bridge.configSave!).mockRejectedValueOnce('Disk full')
  fireEvent.click(screen.getByRole('button', { name: 'Dracula' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Disk full')
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Nord' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Illusion (Refined)' })
    ).toHaveAttribute('aria-pressed', 'true')
  )
  expect(bridge.configSave).toHaveBeenCalledTimes(2)
})

it('opens section navigation in a narrow window and closes it after selection', async () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    media: '(max-width: 767px)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn().mockReturnValue(true),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
  await openEditor()
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Alternar navegação' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Aparência' }))
  expect(screen.getByRole('heading', { name: 'Aparência' })).toBeInTheDocument()
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
})

it('defaults to System with both preview halves and saves the system preference', async () => {
  vi.mocked(bridge.configLoad!).mockResolvedValueOnce({
    config: {
      ...defaultConfig,
      bar: { ...defaultConfig.bar, theme: 'system' }
    },
    revision: 1,
    error: null
  })
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: /Apar/ }))
  const system = screen.getByRole('button', { name: 'Sistema' })
  expect(system).toHaveAttribute('aria-pressed', 'true')
  const preview = screen
    .getByRole('button', { name: 'Illusion (Refined)' })
    .querySelector('[data-theme-preview="system"]')!
  expect(preview).toHaveAttribute('inert')
  expect(preview.children).toHaveLength(3)
  expect(preview.children[0]).toHaveAttribute('data-theme', 'light')
  expect(preview.children[1]).toHaveAttribute('data-theme', 'dark')
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  fireEvent.click(system)
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: expect.objectContaining({ theme: 'system' })
      })
    )
  )
})

it('edits widget behavior through the inspector before applying', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Configurar CPU' }))
  fireEvent.change(screen.getByLabelText('Intervalo (ms)'), {
    target: { value: '5000' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Compacto' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar tooltip' }))
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          right: expect.arrayContaining([
            expect.objectContaining({
              id: 'cpu',
              intervalMs: 5000,
              format: 'compact',
              tooltip: false
            })
          ])
        })
      })
    )
  )
})

it('round-trips JSON through Apply and rejects invalid fields without saving', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  const json = screen.getByRole('textbox', { name: 'Configuração JSON' })
  const config = JSON.parse((json as HTMLTextAreaElement).value)
  config.widgets.right[0].intervalMs = 999
  fireEvent.change(json, { target: { value: JSON.stringify(config) } })
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'widgets.right.0.intervalMs'
  )
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  expect(bridge.configSave).not.toHaveBeenCalled()
  config.widgets.right[0].intervalMs = 6000
  fireEvent.change(json, { target: { value: JSON.stringify(config) } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(configSchema.parse(config))
  )
  expect(JSON.parse((json as HTMLTextAreaElement).value)).toEqual(
    configSchema.parse(config)
  )
})

it('edits one monitor widget override without changing the global widget', async () => {
  await openEditor()
  fireEvent.click(await screen.findByRole('tab', { name: /Monitor 2/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Configurar CPU' }))
  fireEvent.change(screen.getByLabelText('Intervalo (ms)'), {
    target: { value: '8000' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Concluir' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ativar CPU' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        monitors: {
          'screen-b': { widgets: { cpu: { intervalMs: 8000, enabled: false } } }
        },
        widgets: expect.objectContaining({
          right: expect.arrayContaining([
            expect.objectContaining({
              id: 'cpu',
              intervalMs: 2000,
              enabled: true
            })
          ])
        })
      })
    )
  )
})

it('uses live Voicemeeter slot names and retains the target while Windows handling is active', async () => {
  vi.mocked(connect).mockImplementation(
    (_adapter, channel, _options, onValue) => {
      if (channel === 'voicemeeter')
        onValue({
          status: 'ready',
          data: {
            application: 2,
            strips: [],
            buses: [
              {
                index: 2,
                slot: 'A3',
                name: 'Studio speakers',
                physical: true,
                gain: 0,
                mute: false
              }
            ]
          }
        } as never)
      return () => {}
    }
  )
  await openEditor()
  openAudioOutput()
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Saída de áudio' })).getByRole(
      'combobox',
      { name: 'Fonte de áudio' }
    )
  )
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'Voicemeeter' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'Voicemeeter' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Alvo Voicemeeter' }))
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'A3 · Studio speakers' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'A3 · Studio speakers' }))
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Saída de áudio' })).getByRole(
      'combobox',
      { name: 'Fonte de áudio' }
    )
  )
  fireEvent.pointerDown(await screen.findByRole('option', { name: 'Windows' }))
  fireEvent.click(screen.getByRole('option', { name: 'Windows' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: {
          output: { source: 'windows', targetIndex: 2 },
          input: defaultConfig.audio.input
        }
      })
    )
  )
})

it('offers bounded manual audio targets when the channel is unavailable', async () => {
  vi.mocked(connect).mockImplementation(
    (_adapter, _channel, _options, onValue) => {
      onValue({ status: 'error', data: null, error: 'Voicemeeter unavailable' })
      return () => {}
    }
  )
  await openEditor()
  openAudioOutput()
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Entrada de áudio' })).getByRole(
      'combobox',
      { name: 'Fonte de áudio' }
    )
  )
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'Voicemeeter' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'Voicemeeter' }))
  expect(screen.getByText(/Lista ao vivo indisponível/)).toBeInTheDocument()
  expect(
    screen.queryByRole('combobox', { name: 'Alvo Voicemeeter' })
  ).not.toBeInTheDocument()
  const index = screen.getByLabelText('Índice do alvo')
  expect(index).toHaveAttribute('min', '0')
  expect(index).toHaveAttribute('max', '7')
  fireEvent.change(index, { target: { value: '8' } })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Aplicar', hidden: true })
    ).toBeDisabled()
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.change(index, { target: { value: '7' } })
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Aplicar', hidden: true })
    ).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar', hidden: true }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: {
          output: defaultConfig.audio.output,
          input: { source: 'voicemeeter', targetIndex: 7 }
        }
      })
    )
  )
})

it('applies per-agent visibility checkboxes through the normal save', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: {
          visible: {
            chatgpt: true,
            opencode: true,
            antigravity: true,
            codex: false
          }
        }
      })
    )
  )
})

it('keeps invalid JSON across navigation, and restores defaults to the shared Draft', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  fireEvent.change(screen.getByLabelText('Configuração JSON'), {
    target: { value: '{' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  expect(screen.getByLabelText('Configuração JSON')).toHaveValue('{')
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
  expect(
    JSON.parse(
      (screen.getByLabelText('Configuração JSON') as HTMLTextAreaElement).value
    )
  ).toEqual(defaultConfig)
})

it('keeps the settings window close action available with invalid JSON', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  fireEvent.change(screen.getByLabelText('Configuração JSON'), {
    target: { value: 'invalid' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Fechar' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(bridge.quit).not.toHaveBeenCalled()
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it.each(['display2', String.raw`\\.\DISPLAY2`])(
  'rejects duplicate monitor alias %s in JSON with field context',
  async (alias) => {
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    const config = structuredClone(defaultConfig)
    config.monitors = { DISPLAY2: {}, [alias]: {} }
    fireEvent.change(screen.getByLabelText('Configuração JSON'), {
      target: { value: JSON.stringify(config) }
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `monitors.${alias}: Duplicate monitor name`
    )
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
    expect(bridge.configSave).not.toHaveBeenCalled()
  }
)

it('opens widget settings in a popup and returns to the layout on completion', async () => {
  await openEditor()
  const cpu = screen.getByRole('button', { name: 'Configurar CPU' })
  fireEvent.click(cpu)
  const popup = await screen.findByRole('dialog', { name: 'Configurar CPU' })
  expect(within(popup).getByLabelText('Intervalo (ms)')).toBeVisible()
  fireEvent.click(within(popup).getByRole('button', { name: 'Concluir' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  expect(cpu).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Configurar RAM' }))
  expect(
    await screen.findByRole('dialog', { name: 'Configurar RAM' })
  ).toBeVisible()
})

it('applies editable native bar geometry only after Apply', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.keyDown(screen.getByRole('slider', { name: 'Altura da barra' }), {
    key: 'End'
  })
  fireEvent.click(screen.getByRole('button', { name: 'Inferior' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sempre no topo' }))
  fireEvent.keyDown(
    screen.getByRole('slider', { name: 'Espaçamento entre widgets' }),
    { key: 'End' }
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: expect.objectContaining({
          height: 80,
          position: 'bottom',
          alwaysOnTop: false,
          spacing: 32
        })
      })
    )
  )
})

it('connects Spotify in music settings immediately without saving or reverting the account', async () => {
  rememberNavigation({ section: 'music' })
  const id = '0123456789abcdef0123456789abcdef'
  vi.mocked(bridge.spotifyStatus!).mockResolvedValue({
    state: 'disconnected',
    clientId: '',
    error: null
  })
  vi.mocked(bridge.spotifyConnect!).mockImplementation(async () => {
    vi.mocked(bridge.spotifyStatus!).mockResolvedValue({
      state: 'connected',
      clientId: id,
      error: null
    })
  })
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Player de música' }))
  expect(await screen.findByText(/Reverter não desfaz/)).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: 'Client ID' }), {
    target: { value: id }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Conectar Spotify' }))
  expect(await screen.findByText('Spotify conectado')).toBeVisible()
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  expect(screen.getByText('Spotify conectado')).toBeVisible()
  expect(bridge.spotifyDisconnect).not.toHaveBeenCalled()
  vi.mocked(bridge.spotifyDisconnect!).mockImplementation(async () => {
    vi.mocked(bridge.spotifyStatus!).mockResolvedValue({
      state: 'disconnected',
      clientId: '',
      error: null
    })
  })
  fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
  expect(await screen.findByText('Spotify desconectado')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(defaultConfig)
  )
})

it.each(['connect', 'disconnect', 'status'] as const)(
  'shows Spotify %s failures without changing the saved draft',
  async (operation) => {
    rememberNavigation({ section: 'music' })
    vi.mocked(bridge.spotifyStatus!).mockResolvedValue({
      state: 'connected',
      clientId: '0123456789abcdef0123456789abcdef',
      error: null
    })
    if (operation === 'status')
      vi.mocked(bridge.spotifyStatus!).mockRejectedValue(
        new Error('Spotify unavailable')
      )
    else if (operation === 'connect')
      vi.mocked(bridge.spotifyConnect!).mockRejectedValue(
        new Error('Spotify unavailable')
      )
    else
      vi.mocked(bridge.spotifyDisconnect!).mockRejectedValue(
        new Error('Spotify unavailable')
      )
    await openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Player de música' }))
    if (operation !== 'status') {
      const action = await screen.findByRole('button', {
        name: operation === 'connect' ? 'Conectar Spotify' : 'Desconectar'
      })
      await waitFor(() => expect(action).toBeEnabled())
      fireEvent.click(action)
    }
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Spotify unavailable'
    )
    expect(bridge.configSave).not.toHaveBeenCalled()
  }
)

it('opens Calendar credentials in the Lembretes settings section', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Lembretes' }))
  expect(
    await screen.findByLabelText('Client ID do Google')
  ).toBeInTheDocument()
  expect(screen.getByText(/Reverter não desfaz/)).toBeInTheDocument()
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('connects and disconnects Calendar immediately while Reverter only reloads the Draft', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  calendarAccount.status.mockResolvedValue({
    connected: false,
    connecting: false,
    error: null
  })
  calendarAccount.connect.mockImplementation(async () => {
    const value = { connected: true, connecting: false, error: null }
    calendarAccount.status.mockResolvedValue(value)
    return value
  })
  calendarAccount.disconnect.mockImplementation(async () => {
    const value = { connected: false, connecting: false, error: null }
    calendarAccount.status.mockResolvedValue(value)
    return value
  })
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Lembretes' }))
  fireEvent.change(await screen.findByLabelText('Client ID do Google'), {
    target: { value: ' client.apps.googleusercontent.com ' }
  })
  fireEvent.change(
    screen.getByLabelText('Client Secret (se fornecido pelo Google)'),
    { target: { value: ' secret ' } }
  )
  fireEvent.click(
    screen.getByRole('button', { name: 'Conectar Google Calendar' })
  )
  const disconnect = await screen.findByRole('button', {
    name: 'Desconectar Google'
  })
  expect(calendarAccount.connect).toHaveBeenCalledWith(
    'client.apps.googleusercontent.com',
    'secret'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() => expect(bridge.configLoad).toHaveBeenCalledTimes(2))
  expect(calendarAccount.disconnect).not.toHaveBeenCalled()
  expect(disconnect).toBeInTheDocument()
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(disconnect)
  await screen.findByRole('button', { name: 'Conectar Google Calendar' })
  expect(calendarAccount.disconnect).toHaveBeenCalledOnce()
  expect(
    screen.getByLabelText('Client Secret (se fornecido pelo Google)')
  ).toHaveValue('')
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
})

it('receives OAuth completion after navigating away and returning while connecting', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  calendarAccount.status.mockResolvedValue({
    connected: false,
    connecting: true,
    error: null
  })
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Lembretes' }))
  await screen.findByRole('button', {
    name: 'Aguardando autorização no navegador…'
  })
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Lembretes' }))
  expect(
    await screen.findByRole('button', {
      name: 'Aguardando autorização no navegador…'
    })
  ).toBeDisabled()
  calendarAccount.status.mockResolvedValue({
    connected: true,
    connecting: false,
    error: null
  })
  calendarEvents.listener?.()
  expect(
    await screen.findByRole('button', { name: 'Desconectar Google' })
  ).toBeEnabled()
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
})

it('edits agent visibility only in the shared draft and reverts without saving', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  const codex = await screen.findByRole('checkbox', {
    name: 'Mostrar Codex na barra'
  })
  fireEvent.click(codex)
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  expect(
    JSON.parse(
      (screen.getByLabelText('Configuração JSON') as HTMLTextAreaElement).value
    ).agents.visible.codex
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
    ).toBeChecked()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  expect(screen.queryByText('Agentes visíveis')).not.toBeInTheDocument()
})

it('runs integration actions immediately and keeps them independent of Apply and Revert', async () => {
  const openCode = vi.spyOn(agentAdapter, 'setOpenCode')
  const codex = vi.spyOn(agentAdapter, 'setCodex')
  const antigravity = vi.spyOn(agentAdapter, 'setAntigravity')
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  expect(
    screen.getByText(/Aplicar e Reverter não desfazem essas ações/)
  ).toBeInTheDocument()
  fireEvent.click(
    await screen.findByRole('button', { name: 'Conectar OpenCode' })
  )
  await screen.findByRole('button', { name: 'Desconectar OpenCode' })
  expect(openCode).toHaveBeenCalledExactlyOnceWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Ativar hooks do Codex' }))
  await screen.findByRole('button', { name: 'Desativar hooks do Codex' })
  expect(codex).toHaveBeenCalledExactlyOnceWith(true)
  fireEvent.click(
    screen.getByRole('button', { name: 'Ativar hooks do Antigravity' })
  )
  await screen.findByRole('button', { name: 'Desativar hooks do Antigravity' })
  expect(antigravity).toHaveBeenCalledExactlyOnceWith(true)
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
    ).toBeChecked()
  )
  expect(openCode).toHaveBeenCalledTimes(1)
  expect(codex).toHaveBeenCalledTimes(1)
  expect(antigravity).toHaveBeenCalledTimes(1)
  expect(bridge.configSave).not.toHaveBeenCalled()
  for (const name of [
    'Desconectar OpenCode',
    'Desativar hooks do Codex',
    'Desativar hooks do Antigravity'
  ]) {
    fireEvent.click(screen.getByRole('button', { name }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    )
  }
  expect(openCode).toHaveBeenLastCalledWith(false)
  expect(codex).toHaveBeenLastCalledWith(false)
  expect(antigravity).toHaveBeenLastCalledWith(false)
})

it('shows native integration failures without changing the draft or claiming a connection', async () => {
  vi.spyOn(agentAdapter, 'setOpenCode').mockRejectedValue(
    new Error('OpenCode não está disponível')
  )
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  const connect = await screen.findByRole('button', {
    name: 'Conectar OpenCode'
  })
  await waitFor(() => expect(connect).toBeEnabled())
  fireEvent.click(connect)
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'OpenCode não está disponível'
  )
  expect(
    screen.getByRole('button', { name: 'Conectar OpenCode' })
  ).toBeEnabled()
  expect(
    screen.queryByRole('button', { name: 'Desconectar OpenCode' })
  ).not.toBeInTheDocument()
  expect(bridge.configSave).not.toHaveBeenCalled()
})

it('recovers applied agent visibility after reopening and preserves saved values on a failed save', async () => {
  let saved = structuredClone(defaultConfig)
  vi.mocked(bridge.configLoad!).mockImplementation(async () => ({
    config: saved,
    revision: 1,
    error: null
  }))
  vi.mocked(bridge.configSave!).mockImplementation(async (config) => {
    saved = configSchema.parse(config)
    return { config: saved, revision: 2, error: null }
  })
  const first = render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(saved.agents.visible.codex).toBe(false))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  first.unmount()
  await openEditor()
  expect(
    screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
  ).not.toBeChecked()
  vi.mocked(bridge.configSave!).mockRejectedValueOnce(
    new Error('Falha de gravação')
  )
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Falha de gravação'
  )
  expect(saved.agents.visible.codex).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: 'Mostrar Codex na barra' })
    ).not.toBeChecked()
  )
})

it('keeps global audio edits in Draft and restores the saved settings after a failed save and reopen', async () => {
  const saved = structuredClone(defaultConfig)
  saved.audio.output = { source: 'voicemeeter', targetIndex: 3 }
  vi.mocked(connect).mockImplementation(() => () => {})
  vi.mocked(bridge.configLoad!).mockResolvedValue({
    config: saved,
    revision: 1,
    error: null
  })
  vi.mocked(bridge.configSave!).mockRejectedValueOnce(
    new Error('Disk write denied')
  )
  const view = render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  openAudioOutput()
  expect(screen.getByLabelText('Índice do alvo')).toHaveValue(3)
  fireEvent.change(screen.getByLabelText('Índice do alvo'), {
    target: { value: '5' }
  })
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
  expect(
    JSON.parse(
      (screen.getByLabelText('Configuração JSON') as HTMLTextAreaElement).value
    ).audio.output.targetIndex
  ).toBe(5)
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Disk write denied'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  openAudioOutput()
  expect(screen.getByLabelText('Índice do alvo')).toHaveValue(3)
  view.unmount()
  await openEditor()
  expect(screen.getByLabelText('Índice do alvo')).toHaveValue(3)
})

it('configures global audio without widgets and hides removed controls', async () => {
  const config = structuredClone(defaultConfig)
  config.widgets = { left: [], center: [], right: [] }
  vi.mocked(connect).mockImplementation(() => () => {})
  vi.mocked(bridge.configLoad!).mockResolvedValue({
    config,
    revision: 1,
    error: null
  })
  await openEditor()
  openAudioOutput()
  for (const name of [
    'Aplicar configurações em',
    'Instância do widget',
    'Rótulo de áudio',
    'Tipo de alvo',
    'Usar endpoints do Windows mantendo o alvo'
  ])
    expect(screen.queryByLabelText(name)).not.toBeInTheDocument()
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Saída de áudio' })).getByRole(
      'combobox',
      { name: 'Fonte de áudio' }
    )
  )
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'Voicemeeter' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'Voicemeeter' }))
  fireEvent.change(screen.getByLabelText('Índice do alvo'), {
    target: { value: '4' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: {
          ...defaultConfig.audio,
          output: { source: 'voicemeeter', targetIndex: 4 }
        },
        widgets: config.widgets
      })
    )
  )
})

it('opens both audio sections from a single menu and restores the page on reopen', async () => {
  const view = render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  openAudioOutput()
  expect(screen.getByRole('heading', { name: 'Saída de áudio' })).toBeVisible()
  expect(
    screen.getByRole('heading', { name: 'Entrada de áudio' })
  ).toBeVisible()
  expect(screen.getByRole('button', { name: 'Áudio' })).toHaveAttribute(
    'aria-current',
    'page'
  )
  expect(
    screen.queryByRole('button', { name: 'Entrada' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Saída' })
  ).not.toBeInTheDocument()
  expect(
    screen.queryByRole('tablist', { name: 'Configurações de áudio' })
  ).not.toBeInTheDocument()
  view.unmount()
  await openEditor()
  expect(
    screen.getByRole('heading', { name: 'Entrada de áudio' })
  ).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Saída de áudio' })).toBeVisible()
})
