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
  invoke: async () => ({ token: 'disk-test', initial: host.initial })
}))
import { createNativeBridge } from '@/services/system/bridge'
import type { DiskData, DiskVolume } from '@/services/system/disk.generated'

function volume(
  mount: string,
  totalBytes: number,
  freeBytes: number
): DiskVolume {
  const usedBytes = totalBytes - freeBytes
  return {
    mount,
    label: mount === 'C:' ? 'System' : null,
    kind: 'fixed',
    totalBytes,
    freeBytes,
    usedBytes,
    percent: (usedBytes / totalBytes) * 100
  }
}
function observation(sequence: number): DiskData {
  return {
    sequence,
    sampledAt: 100000,
    volumes: [
      volume('C:', 512_000_000_000, 286_720_000_000),
      volume('D:', 1_000_000_000_000, 450_000_000_000)
    ]
  }
}
it('rejects malformed disk data without substituting demo values', async () => {
  host.initial = { status: 'ready', data: { percent: 44 } }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('disk', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  expect(receive.mock.lastCall?.[0].error).toMatch(/discos/)
  await dispose()
})
it('ignores older snapshots, recovers from invalid readings and releases the listener', async () => {
  host.initial = { status: 'ready', data: observation(1) }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('disk', receive)
  for (const sequence of [3, 3, 2])
    host.send?.({ payload: { status: 'ready', data: observation(sequence) } })
  expect(receive.mock.calls.map(([e]) => e.data.sequence)).toEqual([1, 3])
  const inconsistent = observation(4)
  inconsistent.volumes[0].percent = 9
  host.send?.({ payload: { status: 'ready', data: inconsistent } })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  host.send?.({ payload: { status: 'ready', data: observation(5) } })
  expect(receive.mock.lastCall?.[0].data.sequence).toBe(5)
  await dispose()
  expect(host.send).toBeNull()
})
it('rejects volumes that are unsorted or internally inconsistent', async () => {
  const unsorted = observation(1)
  unsorted.volumes.reverse()
  host.initial = { status: 'ready', data: unsorted }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('disk', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  const impossible = observation(2)
  impossible.volumes[0].freeBytes = impossible.volumes[0].totalBytes + 1
  host.send?.({ payload: { status: 'ready', data: impossible } })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  await dispose()
})
it('accepts network volumes and rejects payloads without a kind', async () => {
  const withRemote = observation(1)
  withRemote.volumes[1].kind = 'remote'
  host.initial = { status: 'ready', data: withRemote }
  const receive = vi.fn()
  let dispose = await createNativeBridge().subscribe('disk', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('ready')
  expect(receive.mock.lastCall?.[0].data.volumes[1].kind).toBe('remote')
  await dispose()

  const missing = observation(2) as { volumes: Array<Partial<DiskVolume>> }
  delete missing.volumes[0].kind
  host.initial = { status: 'ready', data: missing }
  receive.mockClear()
  dispose = await createNativeBridge().subscribe('disk', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  await dispose()
})
