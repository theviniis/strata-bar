import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { configSchema, defaultConfig } from '../services/configuration/config'
import { bridge, connect } from '../services/system/bridge'
import { SettingsView } from '../settings/SettingsView'

const close = vi.hoisted(() => vi.fn())
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
    quit: vi.fn()
  }
}))

beforeEach(() => {
  vi.clearAllMocks()
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

async function openEditor() {
  render(<SettingsView />)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
}

it('loads the saved configuration and applies the edited layout through native save', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  expect(screen.getByRole('button', { name: 'Claro' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Layout' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Mover CPU para' }))
  fireEvent.pointerDown(await screen.findByRole('option', { name: 'Esquerda' }))
  fireEvent.click(screen.getByRole('option', { name: 'Esquerda' }))
  expect(
    within(screen.getByRole('region', { name: 'Seção Esquerda' })).getByRole(
      'checkbox',
      { name: 'Ativar CPU' }
    )
  ).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() => expect(bridge.configSave).toHaveBeenCalledOnce())
  expect(vi.mocked(bridge.configSave!).mock.calls[0][0]).toMatchObject({
    bar: { theme: 'light' },
    widgets: {
      left: expect.arrayContaining([expect.objectContaining({ id: 'cpu' })])
    }
  })
})

it('reverts by reloading the saved file and restores defaults through save', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  fireEvent.click(screen.getByRole('button', { name: 'Claro' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reverter' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  expect(bridge.configLoad).toHaveBeenCalledTimes(2)
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrões' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(defaultConfig)
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

it('previews the draft NativeBar layout in both themes without native subscriptions', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('combobox', { name: 'Mover CPU para' }))
  fireEvent.pointerDown(await screen.findByRole('option', { name: 'Esquerda' }))
  fireEvent.click(screen.getByRole('option', { name: 'Esquerda' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
  for (const name of ['Escuro', 'Claro']) {
    const choice = screen.getByRole('button', { name })
    const preview = choice.querySelector('[data-theme-preview]')!
    expect(preview).toHaveAttribute('inert')
    const cpu = within(preview as HTMLElement).getByLabelText(
      'Detalhes da CPU',
      { selector: 'button' }
    )
    expect(cpu).toHaveTextContent('17%')
    expect(cpu.closest('[data-section]')).toHaveAttribute(
      'data-section',
      'left'
    )
    expect(preview.querySelector('.native-bar')).toBeNull()
  }
  expect(connect).not.toHaveBeenCalled()
  expect(bridge.configSave).not.toHaveBeenCalled()
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
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: /Apar/ }))
  const system = screen.getByRole('button', { name: 'System' })
  expect(system).toHaveAttribute('aria-pressed', 'true')
  const preview = system.querySelector('[data-theme-preview="system"]')!
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
