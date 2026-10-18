import { it, expect, vi } from 'vitest'
import {
  connect,
  createMockBridge,
  type Channel,
  type ChannelData,
  type Subscribable
} from '../services/system/bridge'

it('disposes asynchronous subscriptions that resolve after unmount', async () => {
  let resolve: (dispose: () => void) => void = () => {}
  const dispose = vi.fn(),
    value = vi.fn()
  // Only disposal ordering matters here, so the payload is a placeholder sample.
  const cpu: Subscribable<Record<Channel, ChannelData['cpu']>> = {
    subscribe: (_channel, listener) => {
      listener({ status: 'loading', timestamp: 0 })
      return new Promise((r) => (resolve = r))
    }
  }
  const stop = connect(cpu, 'cpu', {}, value, vi.fn())
  await Promise.resolve()
  stop()
  stop()
  resolve(dispose)
  await new Promise((r) => setTimeout(r, 0))
  expect(dispose).toHaveBeenCalledTimes(1)
})

it('reports subscription failure', async () => {
  const error = vi.fn()
  const offline: Subscribable<Record<Channel, never>> = {
    subscribe: async () => {
      throw Error('offline')
    }
  }
  connect(offline, 'cpu', {}, vi.fn(), error)
  await new Promise((r) => setTimeout(r, 0))
  expect(error).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'offline' })
  )
})

it('stops mock timers after disposal and marks GPU unsupported', async () => {
  vi.useFakeTimers()
  try {
    const cb = vi.fn()
    const stop = await createMockBridge().subscribe('cpu', cb, {
      intervalMs: 1000
    })
    expect(cb).toHaveBeenCalledTimes(1)
    stop()
    vi.advanceTimersByTime(5000)
    expect(cb).toHaveBeenCalledTimes(1)
    const gpu = vi.fn()
    ;(await createMockBridge().subscribe('gpu', gpu))()
    expect(gpu.mock.calls[0][0].status).toBe('unavailable')
  } finally {
    vi.useRealTimers()
  }
})
