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
    expect(screen.getByRole('button', { name: 'Sistema' })).toHaveAttribute(
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
  const system = screen.getByRole('button', { name: 'Sistema' })
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

it('edits widget behavior through the inspector before applying', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Configurar CPU' }))
  fireEvent.change(screen.getByLabelText('Intervalo (ms)'), {
    target: { value: '5000' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Compacto' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar tooltip' }))
  expect(bridge.configSave).not.toHaveBeenCalled()
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
  fireEvent.click(screen.getByRole('button', { name: 'Configurar CPU' }))
  fireEvent.change(screen.getByLabelText('Monitor'), {
    target: { value: 'DISPLAY2' }
  })
  fireEvent.click(
    screen.getByRole('checkbox', { name: 'Personalizar neste monitor' })
  )
  fireEvent.change(screen.getByLabelText('Intervalo (ms)'), {
    target: { value: '8000' }
  })
  fireEvent.click(screen.getByRole('checkbox', { name: 'Ativo neste monitor' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        monitors: {
          DISPLAY2: {
            widgets: {
              cpu: expect.objectContaining({ intervalMs: 8000, enabled: false })
            }
          }
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
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Volume' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Fonte de áudio' }))
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'Voicemeeter' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'Voicemeeter' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Alvo Voicemeeter' }))
  fireEvent.pointerDown(
    await screen.findByRole('option', { name: 'A3 · Studio speakers' })
  )
  fireEvent.click(screen.getByRole('option', { name: 'A3 · Studio speakers' }))
  fireEvent.change(screen.getByLabelText('Rótulo de áudio'), {
    target: { value: 'Desk' }
  })
  fireEvent.click(
    screen.getByRole('checkbox', {
      name: 'Usar endpoints do Windows mantendo o alvo'
    })
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          right: expect.arrayContaining([
            expect.objectContaining({
              id: 'volume',
              audio: {
                source: 'voicemeeter',
                target: { kind: 'bus', index: 2 },
                enabled: false,
                label: 'Desk'
              }
            })
          ])
        })
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
  fireEvent.click(screen.getByRole('button', { name: 'Configurar Microfone' }))
  fireEvent.click(screen.getByRole('combobox', { name: 'Fonte de áudio' }))
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
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
  )
  expect(bridge.configSave).not.toHaveBeenCalled()
  fireEvent.change(index, { target: { value: '7' } })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  )
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  await waitFor(() =>
    expect(bridge.configSave).toHaveBeenCalledWith(
      expect.objectContaining({
        widgets: expect.objectContaining({
          right: expect.arrayContaining([
            expect.objectContaining({
              id: 'microphone',
              audio: {
                source: 'voicemeeter',
                target: { kind: 'strip', index: 7 }
              }
            })
          ])
        })
      })
    )
  )
})

it('applies per-agent visibility checkboxes through the normal save', async () => {
  await openEditor()
  fireEvent.click(screen.getByRole('button', { name: 'Aparência' }))
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

it('keeps invalid JSON across navigation, and restores defaults through save', async () => {
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
    expect(bridge.configSave).toHaveBeenCalledWith(defaultConfig)
  )
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
