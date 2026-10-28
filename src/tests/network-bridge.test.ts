import { beforeEach, expect, it, vi } from 'vitest'
import { networkFixture } from '@/features/network/src/fixtures'
import { createNativeBridge } from '@/services/system/bridge'
const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  stop: vi.fn(),
  listener: undefined as undefined | ((event: { payload: unknown }) => void)
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(
    async (_name: string, listener: (event: { payload: unknown }) => void) => {
      native.listener = listener
      return native.stop
    }
  )
}))
beforeEach(() => {
  vi.clearAllMocks()
  native.listener = undefined
})
it('subscribes to native network, rejects malformed data and disposes once', async () => {
  const data = networkFixture()
  native.invoke.mockResolvedValueOnce({
    token: 'network1',
    initial: { status: 'ready', data }
  })
  const listener = vi.fn()
  const dispose = await createNativeBridge().subscribe('network', listener)
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'ready', data })
  )
  native.listener!({
    payload: { status: 'ready', data: { ...data, download: -100 } }
  })
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error' })
  )
  native.listener!({ payload: { status: 'error', error: 'native offline' } })
  expect(listener).toHaveBeenLastCalledWith(
    expect.objectContaining({ status: 'error', error: 'native offline' })
  )
  await dispose()
  await dispose()
  expect(native.stop).toHaveBeenCalledOnce()
  expect(native.invoke).toHaveBeenLastCalledWith('unsubscribe', {
    token: 'network1'
  })
})
it('routes fixed native test commands', async () => {
  native.invoke.mockResolvedValue(undefined)
  const bridge = createNativeBridge()
  await bridge.networkTestStart!()
  await bridge.networkTestCancel!()
  expect(native.invoke.mock.calls).toEqual([
    ['network_test_start'],
    ['network_test_cancel']
  ])
})
