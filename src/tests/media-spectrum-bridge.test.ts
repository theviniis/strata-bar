import { expect, it, vi } from 'vitest'
import { createNativeBridge } from '@/services/system/bridge'
import { demoSpectrum } from '@/services/system/media-spectrum'

const host = vi.hoisted(() => ({
  listener: null as null | ((event: { payload: unknown }) => void),
  invoke: vi.fn(),
  stop: vi.fn()
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_: string, callback: typeof host.listener) => {
    host.listener = callback
    return host.stop
  }
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => host.invoke(...args)
}))

it('prefers a live spectrum over the initial response, fences old captures and releases once', async () => {
  host.invoke.mockImplementation(async (command) => {
    if (command !== 'subscribe') return
    host.listener!({
      payload: { status: 'ready', data: { ...demoSpectrum(), generation: 2 } }
    })
    return {
      token: 'spectrum1',
      initial: { status: 'ready', data: demoSpectrum() }
    }
  })
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('mediaSpectrum', receive)
  expect(receive).toHaveBeenCalledTimes(1)
  expect(receive.mock.lastCall![0].data.generation).toBe(2)
  host.listener!({ payload: { status: 'ready', data: demoSpectrum() } })
  expect(receive).toHaveBeenCalledTimes(1)
  host.listener!({ payload: { status: 'unavailable', data: null } })
  expect(receive.mock.lastCall![0].status).toBe('unavailable')
  await dispose()
  await dispose()
  expect(
    host.invoke.mock.calls.filter(([name]) => name === 'unsubscribe')
  ).toEqual([['unsubscribe', { token: 'spectrum1' }]])
})

it('rejects native setup failures without generating demonstration frequencies', async () => {
  host.invoke.mockRejectedValueOnce(new Error('Capture unavailable'))
  const receive = vi.fn()
  await expect(
    createNativeBridge().subscribe('mediaSpectrum', receive)
  ).rejects.toThrow('Capture unavailable')
  expect(receive).not.toHaveBeenCalled()
  expect(host.stop).toHaveBeenCalled()
})
