import { it, expect, vi } from 'vitest'
const state = vi.hoisted(() => ({
  listener: null,
  stop: vi.fn(),
  invoke: vi.fn()
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event, listener) => {
    state.listener = listener
    return state.stop
  })
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args) => state.invoke(...args)
}))
import { createNativeBridge } from '../services/system/bridge'
it('does not overwrite a live event with an older initial snapshot', async () => {
  state.invoke.mockImplementation(async (command) => {
    if (command === 'subscribe') {
      state.listener({ payload: { status: 'ready', data: { level: 72 } } })
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
