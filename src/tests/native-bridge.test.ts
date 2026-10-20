import { it, expect, vi, type Mock } from 'vitest'
import type { ChannelData, SystemEvent } from '../services/system/bridge'

type Listener = (event: { payload: SystemEvent<ChannelData['volume']> }) => void
type WorkspaceListener = (event: {
  payload: SystemEvent<ChannelData['komorebi']>
}) => void

const windows = vi.hoisted(() => ({
  current: 'bar-0',
  listeners: new Map<string, WorkspaceListener>(),
  stops: new Map<string, Mock>()
}))

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => ({
    label: windows.current,
    async listen(
      this: { label: string },
      _event: string,
      listener: WorkspaceListener
    ) {
      const label = this.label
      windows.listeners.set(label, listener)
      const stop = vi.fn(() => windows.listeners.delete(label))
      windows.stops.set(label, stop)
      return stop
    }
  })
}))

const state = vi.hoisted<{
  listener: Listener | null
  stop: Mock
  invoke: Mock
}>(() => ({ listener: null, stop: vi.fn(), invoke: vi.fn() }))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event: string, listener: Listener) => {
    state.listener = listener
    return state.stop
  })
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => state.invoke(...args)
}))
import { createNativeBridge } from '../services/system/bridge'
import {
  createDemoOverlay,
  createNativeOverlay
} from '../services/system/overlay'

function workspaceEvent(
  monitor: number,
  active: number
): SystemEvent<ChannelData['komorebi']> {
  return {
    status: 'ready',
    data: {
      monitor,
      floatOverride: false,
      workspaces: [0, 1].map((index) => ({
        index,
        name: null,
        status: index === active ? 'active' : 'empty',
        layer: 'Tiling',
        windows: 0
      }))
    }
  }
}

it('isolates komorebi updates and initial snapshots by bar window', async () => {
  state.invoke.mockReset()
  windows.listeners.clear()
  windows.stops.clear()
  state.invoke.mockImplementation(async (command: string) => {
    if (command !== 'subscribe') return
    const label = windows.current
    expect(windows.listeners.has(label)).toBe(true)
    const monitor = label === 'bar-0' ? 0 : 1
    if (monitor === 1) {
      windows.listeners.get(label)!({ payload: workspaceEvent(1, 1) })
    }
    return { token: label, initial: workspaceEvent(monitor, 0) }
  })
  windows.current = 'bar-0'
  const first = vi.fn()
  const disposeFirst = await createNativeBridge().subscribe('komorebi', first)
  expect(first).toHaveBeenCalledExactlyOnceWith(workspaceEvent(0, 0))

  windows.current = 'bar-1'
  const second = vi.fn()
  const disposeSecond = await createNativeBridge().subscribe('komorebi', second)
  expect(second).toHaveBeenCalledExactlyOnceWith(workspaceEvent(1, 1))
  expect(first).toHaveBeenCalledTimes(1)

  windows.listeners.get('bar-0')!({ payload: workspaceEvent(0, 1) })
  expect(first).toHaveBeenLastCalledWith(workspaceEvent(0, 1))
  expect(second).toHaveBeenCalledTimes(1)
  windows.listeners.get('bar-1')!({ payload: workspaceEvent(1, 0) })
  expect(second).toHaveBeenLastCalledWith(workspaceEvent(1, 0))
  expect(first).toHaveBeenCalledTimes(2)

  await disposeFirst()
  await disposeFirst()
  expect(windows.stops.get('bar-0')).toHaveBeenCalledTimes(1)
  expect(windows.listeners.has('bar-0')).toBe(false)
  expect(windows.listeners.has('bar-1')).toBe(true)
  await disposeSecond()
  expect(windows.listeners.size).toBe(0)
  expect(state.invoke).toHaveBeenCalledWith('unsubscribe', { token: 'bar-0' })
  expect(state.invoke).toHaveBeenCalledWith('unsubscribe', { token: 'bar-1' })
})

it('removes the window-scoped listener when komorebi subscription fails', async () => {
  windows.current = 'bar-failure'
  state.invoke.mockRejectedValueOnce(Error('native unavailable'))
  await expect(
    createNativeBridge().subscribe('komorebi', vi.fn())
  ).rejects.toThrow('native unavailable')
  expect(windows.stops.get('bar-failure')).toHaveBeenCalledTimes(1)
  expect(windows.listeners.has('bar-failure')).toBe(false)
})

it('does not overwrite a live event with an older initial snapshot', async () => {
  state.invoke.mockImplementation(async (command: string) => {
    if (command === 'subscribe') {
      state.listener!({
        payload: { status: 'ready', data: { level: 72, muted: false } }
      })
      return { token: '1', initial: { status: 'loading' } }
    }
  })
  const update = vi.fn()
  const dispose = await createNativeBridge().subscribe('volume', update, {
    intervalMs: 2000
  })
  expect(update).toHaveBeenCalledTimes(1)
  expect(update.mock.calls[0][0].data.level).toBe(72)
  await dispose()
  await dispose()
  expect(state.stop).toHaveBeenCalledTimes(1)
  expect(state.invoke).toHaveBeenCalledWith('unsubscribe', { token: '1' })
})

it('removes the event listener when native subscription fails', async () => {
  state.stop.mockClear()
  state.invoke.mockRejectedValueOnce(Error('native unavailable'))
  await expect(
    createNativeBridge().subscribe('cpu', vi.fn(), { intervalMs: 2000 })
  ).rejects.toThrow('native unavailable')
  expect(state.stop).toHaveBeenCalledTimes(1)
})

it('spawns validated komorebic commands for workspace actions', async () => {
  state.invoke.mockClear()
  state.invoke.mockResolvedValue(null)
  await createNativeBridge().komorebiAction!({
    action: 'focusWorkspace',
    monitor: 1,
    workspace: 2
  })
  expect(state.invoke).toHaveBeenCalledWith('komorebi_action', {
    action: 'focusWorkspace',
    monitor: 1,
    workspace: 2,
    direction: null
  })
  await createNativeBridge().komorebiAction!({
    action: 'cycleWorkspace',
    direction: 'next'
  })
  expect(state.invoke).toHaveBeenCalledWith('komorebi_action', {
    action: 'cycleWorkspace',
    monitor: null,
    workspace: null,
    direction: 'next'
  })
})

const overlayRequest = {
  v: 1 as const,
  kind: 'tooltip' as const,
  text: 'Uso total de CPU',
  anchor: { x: 120.5, y: 8, width: 74, height: 20 },
  size: { width: 268, height: 26 },
  side: 'bottom' as const
}

it('forwards the overlay contract to the native commands', async () => {
  state.invoke.mockClear()
  state.invoke.mockResolvedValue(null)
  const overlay = createNativeOverlay()
  await overlay.show(overlayRequest)
  expect(state.invoke).toHaveBeenCalledWith('overlay_show', {
    request: overlayRequest
  })
  await overlay.hide()
  expect(state.invoke).toHaveBeenCalledWith('overlay_hide', {
    session: undefined
  })
})

it('keeps the browser overlay adapter inert', async () => {
  state.invoke.mockClear()
  const overlay = createDemoOverlay()
  await overlay.show(overlayRequest)
  await overlay.hide()
  expect(state.invoke).not.toHaveBeenCalled()
})

it('routes microphone controls through dedicated native commands', async () => {
  state.invoke.mockReset().mockResolvedValue(undefined)
  const bridge = createNativeBridge()
  await bridge.setMicrophone!({ level: 42, muted: true })
  expect(state.invoke).toHaveBeenCalledWith('set_microphone', {
    level: 42,
    muted: true
  })
  await bridge.setAudioInput!({ deviceId: 'capture-id' })
  expect(state.invoke).toHaveBeenCalledWith('set_audio_input', {
    deviceId: 'capture-id'
  })
})

it('forwards Voicemeeter channel routing to the native command', async () => {
  state.invoke.mockReset().mockResolvedValue(null)
  const bridge = createNativeBridge()
  await bridge.setChannelSource!('volume', { kind: 'bus', index: 0 })
  expect(state.invoke).toHaveBeenCalledWith('set_channel_source', {
    channel: 'volume',
    target: { kind: 'bus', index: 0 }
  })
  await bridge.setChannelSource!('microphone', null)
  expect(state.invoke).toHaveBeenCalledWith('set_channel_source', {
    channel: 'microphone',
    target: null
  })
})
