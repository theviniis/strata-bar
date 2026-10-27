import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { SystemEvent, VolumeChange } from '@/services/system/bridge'

const host = vi.hoisted(() => ({
  write: vi.fn(),
  listeners: new Map<string, (event: SystemEvent<unknown>) => void>()
}))
vi.mock('@/services/system/bridge', () => ({
  bridge: {
    mode: 'native',
    setVolume: host.write,
    setMicrophone: host.write
  },
  connect: (
    _bridge: unknown,
    channel: string,
    _options: unknown,
    listener: (event: SystemEvent<unknown>) => void
  ) => {
    host.listeners.set(channel, listener)
    listener({
      status: 'ready',
      data:
        channel === 'volume' || channel === 'microphone'
          ? { level: 64, muted: false }
          : {
              devices: [{ id: 'device', name: 'Device' }],
              defaultDeviceId: 'device'
            }
    })
    return () => host.listeners.delete(channel)
  }
}))
vi.mock('@/services/system/overlay', () => ({
  overlay: { resize: vi.fn(), hide: vi.fn() }
}))
import { PopupHost } from '@/popups/popup-host'
import { useConfig } from '@/stores/config'
import { defaultConfig } from '@/services/configuration/config'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

beforeEach(() => {
  vi.clearAllMocks()
  host.listeners.clear()
  useConfig.setState({ config: defaultConfig })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})

for (const [popup, channel] of [
  ['audioOutputs', 'volume'],
  ['audioInputs', 'microphone']
] as const) {
  it(`${channel}: applies volume during dragging and coalesces slow writes without duplicating on release`, async () => {
    vi.stubGlobal('PointerEvent', MouseEvent)
    const replies: Array<(value: { level: number; muted: boolean }) => void> =
      []
    host.write.mockImplementation(
      (_change: VolumeChange) => new Promise((resolve) => replies.push(resolve))
    )
    render(<PopupHost id={popup} mode="native" close={() => {}} />)
    const slider = await screen.findByRole('slider', { name: 'Volume' })
    const track = slider.closest('[dir]')!
    Object.defineProperties(track, {
      setPointerCapture: { value: vi.fn() },
      hasPointerCapture: { value: () => true },
      releasePointerCapture: { value: vi.fn() },
      getBoundingClientRect: { value: () => new DOMRect(0, 0, 100, 10) }
    })
    fireEvent.pointerDown(track, { clientX: 30, button: 0 })
    expect(host.write).toHaveBeenCalledExactlyOnceWith({ level: 30 })
    fireEvent.pointerMove(track, { clientX: 50 })
    fireEvent.pointerMove(track, { clientX: 80 })
    expect(slider).toHaveAttribute('aria-valuenow', '80')
    expect(host.write).toHaveBeenCalledTimes(1)
    await act(async () => replies[0]({ level: 30, muted: false }))
    expect(host.write).toHaveBeenLastCalledWith({ level: 80 })
    expect(host.write).toHaveBeenCalledTimes(2)
    await act(async () => replies[1]({ level: 80, muted: false }))
    fireEvent.pointerUp(track, { clientX: 80 })
    expect(host.write).toHaveBeenCalledTimes(2)
    expect(slider).toHaveAttribute('aria-valuenow', '80')
  })

  it(`${channel}: responds immediately and preserves the latest intent through slow writes`, async () => {
    const replies: Array<(value: { level: number; muted: boolean }) => void> =
      []
    host.write.mockImplementation(
      (_change: VolumeChange) => new Promise((resolve) => replies.push(resolve))
    )
    render(<PopupHost id={popup} mode="native" close={() => {}} />)
    const slider = await screen.findByRole('slider', { name: 'Volume' })
    fireEvent.click(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Silenciar' : 'Silenciar microfone'
      })
    )
    expect(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Ativar som' : 'Ativar microfone'
      })
    ).toBeEnabled()
    fireEvent.click(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Ativar som' : 'Ativar microfone'
      })
    )
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuenow', '66')
    expect(slider).not.toHaveAttribute('data-disabled')
    expect(host.write).toHaveBeenCalledTimes(1)
    act(() =>
      host.listeners.get(channel)!({
        status: 'ready',
        data: { level: 64, muted: true }
      })
    )
    expect(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Silenciar' : 'Silenciar microfone'
      })
    ).toBeEnabled()
    expect(slider).toHaveAttribute('aria-valuenow', '66')
    await act(async () => replies[0]({ level: 64, muted: true }))
    await waitFor(() =>
      expect(host.write).toHaveBeenLastCalledWith({ muted: false, level: 66 })
    )
    vi.useFakeTimers()
    await act(async () => replies[1]({ level: 66, muted: false }))
    act(() =>
      host.listeners.get(channel)!({
        status: 'ready',
        data: { level: 64, muted: true }
      })
    )
    act(() => vi.advanceTimersByTime(1001))
    expect(slider).toHaveAttribute('aria-valuenow', '66')
    expect(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Silenciar' : 'Silenciar microfone'
      })
    ).toBeEnabled()
  })

  it(`${channel}: rolls back only a failed intent and still applies a newer level`, async () => {
    let reject!: (error: Error) => void
    host.write.mockImplementation(async (change: VolumeChange) => ({
      level: 64,
      muted: false,
      ...change
    }))
    host.write.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail
      })
    )
    render(<PopupHost id={popup} mode="native" close={() => {}} />)
    const slider = await screen.findByRole('slider', { name: 'Volume' })
    fireEvent.click(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Silenciar' : 'Silenciar microfone'
      })
    )
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    await act(async () => reject(new Error('Write failed')))
    expect(screen.getByRole('alert')).toHaveTextContent('Write failed')
    expect(
      screen.getByRole('button', {
        name: channel === 'volume' ? 'Silenciar' : 'Silenciar microfone'
      })
    ).toBeEnabled()
    expect(slider).toHaveAttribute('aria-valuenow', '65')
    expect(host.write).toHaveBeenLastCalledWith({ level: 65 })
    act(() =>
      host.listeners.get(channel)!({
        status: 'ready',
        timestamp: 20,
        data: { level: 65, muted: false }
      })
    )
    act(() =>
      host.listeners.get(channel)!({
        status: 'ready',
        timestamp: 30,
        data: { level: 42, muted: true }
      })
    )
    act(() =>
      host.listeners.get(channel)!({
        status: 'ready',
        timestamp: 10,
        data: { level: 64, muted: false }
      })
    )
    expect(slider).toHaveAttribute('aria-valuenow', '42')
  })

  it(`${channel}: discards queued gestures and late replies after a route change or close`, async () => {
    let resolve!: (value: { level: number; muted: boolean }) => void
    host.write.mockReturnValue(
      new Promise((reply) => {
        resolve = reply
      })
    )
    const { unmount } = render(
      <PopupHost id={popup} mode="native" close={() => {}} />
    )
    const slider = await screen.findByRole('slider', { name: 'Volume' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'End' })
    act(() => {
      const config = useConfig.getState().config
      const side = channel === 'volume' ? 'output' : 'input'
      useConfig.setState({
        config: {
          ...config,
          audio: {
            ...config.audio,
            [side]: { source: 'voicemeeter', targetIndex: 1 }
          }
        }
      })
    })
    await act(async () => resolve({ level: 65, muted: false }))
    expect(host.write).toHaveBeenCalledTimes(1)
    expect(slider).toHaveAttribute('aria-valuenow', '64')
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    fireEvent.keyDown(slider, { key: 'End' })
    unmount()
    await act(async () => resolve({ level: 65, muted: false }))
    expect(host.write).toHaveBeenCalledTimes(2)
  })
}
