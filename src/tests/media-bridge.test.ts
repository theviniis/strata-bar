import { expect, it, vi } from 'vitest'
import { demoMedia } from '@/services/system/media'
import { createNativeBridge } from '@/services/system/bridge'

const host = vi.hoisted(() => ({
  listener: null as null | ((event: { payload: unknown }) => void),
  initial: {} as unknown,
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

it('validates media snapshots and idempotently releases the subscription', async () => {
  host.invoke.mockImplementation(async (command) =>
    command === 'subscribe' ? { token: 'm1', initial: host.initial } : undefined
  )
  host.initial = { status: 'ready', data: { malformed: true } }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('media', receive)
  expect(receive.mock.lastCall![0].status).toBe('error')
  host.listener!({ payload: { status: 'ready', data: demoMedia() } })
  expect(receive.mock.lastCall![0].data.title).toBe('Dragonaut')
  await dispose()
  await dispose()
  expect(
    host.invoke.mock.calls.filter(([name]) => name === 'unsubscribe')
  ).toEqual([['unsubscribe', { token: 'm1' }]])
})

it('passes typed media commands and Spotify settings without invoking master volume', async () => {
  const bridge = createNativeBridge()
  const request = {
    sessionId: 'session',
    trackId: 'track',
    action: { action: 'volume' as const, level: 20 }
  }
  host.invoke.mockClear()
  await bridge.mediaAction!(request)
  await bridge.spotifyConnect!('01234567890123456789012345678901')
  await bridge.spotifyStatus!()
  await bridge.spotifyDisconnect!()
  expect(host.invoke.mock.calls).toEqual([
    ['media_action', { request }],
    ['spotify_connect', { clientId: '01234567890123456789012345678901' }],
    ['spotify_status'],
    ['spotify_disconnect']
  ])
})
