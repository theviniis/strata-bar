import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SystemEvent } from '../services/system/bridge'

const host = vi.hoisted(() => ({
  output: {
    devices: [
      { id: 'speakers', name: 'Microfone' },
      { id: 'headphones', name: 'Headset' }
    ],
    defaultDeviceId: 'speakers'
  },
  select: vi.fn(),
  mute: vi.fn(),
  hide: vi.fn(),
  resize: vi.fn(),
  listeners: new Map<string, (value: SystemEvent<unknown>) => void>(),
  stops: vi.fn()
}))
vi.mock('../services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    setAudioInput: host.select,
    setMicrophone: host.mute
  },
  connect: (
    _bridge: unknown,
    channel: string,
    _options: unknown,
    listener: (value: SystemEvent<unknown>) => void
  ) => {
    host.listeners.set(channel, listener)
    listener({
      status: 'ready',
      data:
        channel === 'audioInputs' ? host.output : { level: 64, muted: false }
    })
    return host.stops
  }
}))
vi.mock('../services/system/overlay', () => ({
  overlay: { hide: host.hide, resize: host.resize }
}))
import { PopupHost } from '../popups/PopupHost'
function AudioInputs(props: { session?: string; arrowX?: number }) {
  return (
    <PopupHost id="audioInputs" mode="native" {...props} close={host.hide} />
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom ships no ResizeObserver, which Radix's slider sizing needs on mount.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  host.select.mockResolvedValue({
    ...host.output,
    defaultDeviceId: 'headphones'
  })
  host.mute.mockResolvedValue(undefined)
  host.hide.mockResolvedValue(undefined)
  host.resize.mockResolvedValue({ arrowX: 160 })
})

it('confirms selection, retains the popup and controls mute', async () => {
  const { container } = render(<AudioInputs arrowX={280} />)
  expect(container).toBeTruthy()
  expect(screen.getByRole('button', { name: /Microfone/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Headset' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Headset/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  expect(host.select).toHaveBeenCalledWith({ deviceId: 'headphones' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar microfone' }))
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ muted: true }))
})

it('blocks concurrent selections and allows retry after failure', async () => {
  let reject!: (error: Error) => void
  host.select.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail
    })
  )
  render(<AudioInputs />)
  fireEvent.click(screen.getByRole('button', { name: 'Headset' }))
  expect(screen.getByRole('button', { name: 'Headset' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Microfone/ }))
  expect(host.select).toHaveBeenCalledTimes(1)
  await act(async () => reject(new Error('Dispositivo desconectado')))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Dispositivo desconectado'
  )
  expect(screen.getByRole('button', { name: 'Headset' })).toBeEnabled()
})

it('follows external changes and releases subscriptions on close', () => {
  const { unmount } = render(<AudioInputs />)
  act(() => host.listeners.get('audioInputs')!({ status: 'loading' }))
  expect(
    screen.getByText('Carregando dispositivos de áudio')
  ).toBeInTheDocument()
  act(() =>
    host.listeners.get('audioInputs')!({
      status: 'ready',
      data: { devices: [], defaultDeviceId: null }
    })
  )
  expect(
    screen.getByText('Nenhuma entrada de áudio disponível.')
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Silenciar microfone' })
  ).toBeDisabled()
  act(() =>
    host.listeners.get('audioInputs')!({
      status: 'error',
      error: 'Falha de leitura'
    })
  )
  expect(screen.getByRole('alert')).toHaveTextContent('Falha de leitura')
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(host.hide).toHaveBeenCalled()
  unmount()
  expect(host.stops).toHaveBeenCalledTimes(2)
})

it('commits popup volume with keyboard and follows external changes', async () => {
  render(<AudioInputs />)
  const slider = screen.getByRole('slider', { name: 'Volume' })
  expect(slider).toHaveAttribute('aria-valuenow', '64')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(screen.getByLabelText('Volume atual')).toHaveTextContent('65%')
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ level: 65 }))
  await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '64'))
  fireEvent.keyDown(slider, { key: 'End' })
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ level: 100 }))
  act(() =>
    host.listeners.get('microphone')!({ status: 'error', error: 'Sem saída' })
  )
  // Radix exposes the disabled thumb via `data-disabled`, not the `disabled`
  // attribute that toBeDisabled only understands on form elements.
  expect(slider).toHaveAttribute('data-disabled', '')
})

it('disables controls when no microphone is connected', () => {
  render(<AudioInputs />)
  act(() =>
    host.listeners.get('audioInputs')!({
      status: 'ready',
      data: { devices: [], defaultDeviceId: null }
    })
  )
  act(() => host.listeners.get('microphone')!({ status: 'unavailable' }))
  expect(
    screen.getByText('Nenhuma entrada de áudio disponível.')
  ).toBeInTheDocument()
  expect(
    screen.getByRole('button', { name: 'Silenciar microfone' })
  ).toBeDisabled()
})

it('ignores completion after unmount', async () => {
  let resolve!: (value: typeof host.output) => void
  host.select.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    })
  )
  const { unmount } = render(<AudioInputs />)
  fireEvent.click(screen.getByRole('button', { name: 'Headset' }))
  unmount()
  await act(async () => resolve(host.output))
  expect(host.stops).toHaveBeenCalledTimes(2)
})

it('keeps demo microphone controls local to the preview', async () => {
  render(<PopupHost id="audioInputs" mode="demo" close={host.hide} />)
  fireEvent.click(
    screen.getByRole('button', { name: 'Microfone do headset (demo)' })
  )
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: /Microfone do headset/ })
    ).toHaveAttribute('aria-pressed', 'true')
  )
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar microfone' }))
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Ativar microfone' })
    ).toHaveAttribute('aria-pressed', 'true')
  )
  expect(host.select).not.toHaveBeenCalled()
  expect(host.mute).not.toHaveBeenCalled()
})
