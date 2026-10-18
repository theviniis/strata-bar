import { expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  send: null as null | ((event: { payload: unknown }) => void),
  initial: {} as unknown
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, send: typeof host.send) => {
    host.send = send
    return () => {
      host.send = null
    }
  }
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async () => ({ token: 'memory-test', initial: host.initial })
}))
import { createNativeBridge } from '../services/system/bridge'
import type { MemoryData } from '../services/system/memory.generated'

function observation(sequence: number): MemoryData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: 100000,
    error: null
  })
  return {
    sequence,
    sampledAt: 100000,
    totalBytes: metric(17179869184),
    availableBytes: metric(6442450944),
    usedBytes: metric(9663676416),
    cachedBytes: metric(4294967296),
    pagingFileBytes: metric(1073741824),
    percent: metric(56.25),
    history: []
  }
}

it('rejects malformed memory observations instead of showing fabricated readings', async () => {
  host.initial = { status: 'ready', data: { percent: 999 } }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('memory', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  expect(receive.mock.lastCall?.[0].error).toMatch(/memória/i)
  await dispose()
})

it('ignores duplicate or older observations and recovers after an invalid payload', async () => {
  host.initial = { status: 'ready', data: observation(1) }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('memory', receive)
  host.send?.({ payload: { status: 'ready', data: observation(3) } })
  host.send?.({ payload: { status: 'ready', data: observation(3) } })
  host.send?.({ payload: { status: 'ready', data: observation(2) } })
  expect(receive.mock.calls.map(([event]) => event.data.sequence)).toEqual([
    1, 3
  ])
  host.send?.({ payload: { status: 'ready', data: { percent: 999 } } })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  host.send?.({ payload: { status: 'ready', data: observation(4) } })
  expect(receive.mock.lastCall?.[0].data.sequence).toBe(4)
  await dispose()
})
