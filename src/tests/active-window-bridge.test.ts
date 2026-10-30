import { afterEach, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  listener: null as null | ((event: { payload: unknown }) => void),
  event: '' as string,
  initial: {} as unknown,
  invoke: vi.fn(),
  stop: vi.fn()
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (event: string, callback: typeof host.listener) => {
    host.event = event
    host.listener = callback
    return host.stop
  }
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => host.invoke(...args)
}))
import {
  createMockBridge,
  createNativeBridge,
  demoChannelData
} from '@/services/system/bridge'

afterEach(() => {
  vi.useRealTimers()
  host.listener = null
  host.event = ''
  host.stop.mockClear()
  host.invoke.mockReset()
})

it('delivers the raw activeWindow string and releases the subscription once', async () => {
  host.invoke.mockImplementation(async (command: string) =>
    command === 'subscribe'
      ? {
          token: 'aw-test',
          initial: { status: 'ready', data: 'Visual Studio Code' }
        }
      : undefined
  )
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe(
    'activeWindow',
    receive,
    {
      intervalMs: 250
    }
  )

  // A plain string channel has no dedicated parser: the envelope is forwarded.
  expect(host.event).toBe('system:activeWindow')
  expect(host.invoke).toHaveBeenCalledWith('subscribe', {
    channel: 'activeWindow',
    intervalMs: 250
  })
  expect(receive).toHaveBeenCalledExactlyOnceWith({
    status: 'ready',
    data: 'Visual Studio Code'
  })

  host.listener?.({ payload: { status: 'ready', data: 'Notepad' } })
  expect(receive).toHaveBeenLastCalledWith({ status: 'ready', data: 'Notepad' })
  host.listener?.({ payload: { status: 'loading', data: null } })
  expect(receive).toHaveBeenLastCalledWith({ status: 'loading', data: null })
  host.listener?.({
    payload: { status: 'error', data: null, error: 'IPC offline' }
  })
  expect(receive).toHaveBeenLastCalledWith({
    status: 'error',
    data: null,
    error: 'IPC offline'
  })

  await dispose()
  await dispose()
  expect(host.stop).toHaveBeenCalledOnce()
  expect(
    host.invoke.mock.calls.filter(([name]) => name === 'unsubscribe')
  ).toEqual([['unsubscribe', { token: 'aw-test' }]])
})

it('keeps a live title instead of an older initial snapshot', async () => {
  host.invoke.mockImplementation(async (command: string) => {
    if (command !== 'subscribe') return
    host.listener?.({ payload: { status: 'ready', data: 'Firefox' } })
    return { token: 'aw-live', initial: { status: 'ready', data: 'Explorer' } }
  })
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('activeWindow', receive)

  expect(receive).toHaveBeenCalledExactlyOnceWith({
    status: 'ready',
    data: 'Firefox'
  })
  await dispose()
})

it('removes the listener when the native subscription fails', async () => {
  host.invoke.mockRejectedValueOnce(Error('native unavailable'))
  await expect(
    createNativeBridge().subscribe('activeWindow', vi.fn())
  ).rejects.toThrow('native unavailable')
  expect(host.stop).toHaveBeenCalledOnce()
  expect(host.invoke).not.toHaveBeenCalledWith('unsubscribe', expect.anything())
})

it('serves the demo title without a parser and without a demo timer', async () => {
  vi.useFakeTimers()
  expect(typeof demoChannelData().activeWindow).toBe('string')
  expect(demoChannelData().activeWindow).toBe('Visual Studio Code')

  const receive = vi.fn()
  const stop = await createMockBridge().subscribe('activeWindow', receive, {
    intervalMs: 100
  })
  expect(receive).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ status: 'ready', data: 'Visual Studio Code' })
  )
  vi.advanceTimersByTime(1000)
  expect(receive).toHaveBeenCalledOnce()
  stop()
  expect(vi.getTimerCount()).toBe(0)
})
