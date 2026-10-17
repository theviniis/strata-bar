import { it, expect, vi } from 'vitest'
import { connect, createMockBridge } from '../services/system/bridge'
it('disposes asynchronous subscriptions that resolve after unmount', async () => {
  let resolve
  const dispose = vi.fn(),
    value = vi.fn()
  const stop = connect(
    {
      subscribe: (_, cb) => {
        cb(1)
        return new Promise((r) => (resolve = r))
      }
    },
    'cpu',
    {},
    value,
    vi.fn()
  )
  await Promise.resolve()
  stop()
  stop()
  resolve(dispose)
  await new Promise((r) => setTimeout(r, 0))
  expect(dispose).toHaveBeenCalledTimes(1)
})
it('reports subscription failure', async () => {
  const error = vi.fn()
  connect(
    {
      subscribe: async () => {
        throw Error('offline')
      }
    },
    'cpu',
    {},
    vi.fn(),
    error
  )
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
