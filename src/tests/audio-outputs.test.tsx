import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { SystemEvent } from '../services/system/bridge'

const host = vi.hoisted(() => ({
  output: {
    devices: [
      { id: 'speakers', name: 'Alto-falantes' },
      { id: 'headphones', name: 'Fones' }
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
  bridge: { mode: 'native', setAudioOutput: host.select, setVolume: host.mute },
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
        channel === 'audioOutputs' ? host.output : { level: 64, muted: false }
    })
    return host.stops
  }
}))
vi.mock('../services/system/overlay', () => ({
  overlay: { hide: host.hide, resize: host.resize }
}))
import { PopupHost } from '../popups/PopupHost'
function AudioOutputs(props: { session?: string; arrowX?: number }) {
  return (
    <PopupHost id="audioOutputs" mode="native" {...props} close={host.hide} />
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
  const { container } = render(<AudioOutputs arrowX={280} />)
  expect(container.querySelector('.rotate-45')).toHaveStyle({ left: '280px' })
  expect(screen.getByRole('button', { name: /Alto-falantes/ })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Fones' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /Fones/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  )
  expect(host.select).toHaveBeenCalledWith({ deviceId: 'headphones' })
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Silenciar' }))
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ muted: true }))
})

it('blocks concurrent selections and allows retry after failure', async () => {
  let reject!: (error: Error) => void
  host.select.mockReturnValueOnce(
    new Promise((_resolve, fail) => {
      reject = fail
    })
  )
  render(<AudioOutputs />)
  fireEvent.click(screen.getByRole('button', { name: 'Fones' }))
  expect(screen.getByRole('button', { name: 'Fones' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: /Alto-falantes/ }))
  expect(host.select).toHaveBeenCalledTimes(1)
  await act(async () => reject(new Error('Dispositivo desconectado')))
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Dispositivo desconectado'
  )
  expect(screen.getByRole('button', { name: 'Fones' })).toBeEnabled()
})

it('follows external changes and releases subscriptions on close', () => {
  const { unmount } = render(<AudioOutputs />)
  act(() => host.listeners.get('audioOutputs')!({ status: 'loading' }))
  expect(
    screen.getByText('Carregando dispositivos de audio')
  ).toBeInTheDocument()
  act(() =>
    host.listeners.get('audioOutputs')!({
      status: 'ready',
      data: { devices: [], defaultDeviceId: null }
    })
  )
  expect(
    screen.getByText('Nenhuma saída de áudio disponível.')
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Silenciar' })).toBeEnabled()
  act(() =>
    host.listeners.get('audioOutputs')!({
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
  render(<AudioOutputs />)
  const slider = screen.getByRole('slider', { name: 'Volume' })
  expect(slider).toHaveAttribute('aria-valuenow', '64')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(screen.getByLabelText('Volume atual')).toHaveTextContent('65%')
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ level: 65 }))
  await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '64'))
  fireEvent.keyDown(slider, { key: 'End' })
  await waitFor(() => expect(host.mute).toHaveBeenCalledWith({ level: 100 }))
  act(() =>
    host.listeners.get('volume')!({ status: 'error', error: 'Sem saída' })
  )
  // Radix exposes the disabled thumb via `data-disabled`, not the `disabled`
  // attribute that toBeDisabled only understands on form elements.
  expect(slider).toHaveAttribute('data-disabled', '')
})

it('reports content height for the active session and disconnects on close', async () => {
  const callbacks: Array<() => void> = []
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect
    }
  )
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 320, 238))
  const measure = () => callbacks.forEach((callback) => callback())
  try {
    const { unmount } = render(<AudioOutputs session="popup-session" />)
    act(measure)
    await waitFor(() =>
      expect(host.resize).toHaveBeenCalledWith('popup-session', {
        width: 320,
        height: 238
      })
    )
    rect.mockReturnValue(new DOMRect(0, 0, 450, 304))
    act(measure)
    await waitFor(() =>
      expect(host.resize).toHaveBeenCalledWith('popup-session', {
        width: 450,
        height: 304
      })
    )
    rect.mockReturnValue(new DOMRect(0, 0, 240, 180))
    act(measure)
    await waitFor(() =>
      expect(host.resize).toHaveBeenLastCalledWith('popup-session', {
        width: 240,
        height: 180
      })
    )
    expect(screen.getByRole('dialog').style.maxHeight).toBe('')
    expect(screen.getByRole('dialog')).not.toHaveClass('overflow-y-auto')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  } finally {
    rect.mockRestore()
    vi.unstubAllGlobals()
  }
})
