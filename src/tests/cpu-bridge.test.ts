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
  invoke: async () => ({ token: 'cpu-test', initial: host.initial })
}))
import { createNativeBridge } from '@/services/system/bridge'
import type { CpuData } from '@/services/system/cpu.generated'

function observation(sequence: number): CpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: 100000,
    error: null
  })
  return {
    sequence,
    sampledAt: 100000,
    percent: metric(25.5),
    frequencyHz: metric(3.9e9),
    maxFrequencyHz: metric(2.9e9),
    physicalCores: metric(6),
    logicalProcessors: metric(12),
    temperatureCelsius: {
      status: 'unavailable',
      value: null,
      updatedAt: null,
      error: 'Not running'
    },
    temperatureSensor: null,
    history: []
  }
}
it('rejects malformed CPU data without substituting a nominal frequency or demo', async () => {
  host.initial = { status: 'ready', data: { percent: 123 } }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('cpu', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  expect(receive.mock.lastCall?.[0].error).toMatch(/CPU/)
  await dispose()
})
it('ignores older snapshots, recovers from invalid values and releases the listener', async () => {
  host.initial = { status: 'ready', data: observation(1) }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('cpu', receive)
  for (const sequence of [3, 3, 2])
    host.send?.({ payload: { status: 'ready', data: observation(sequence) } })
  expect(receive.mock.calls.map(([e]) => e.data.sequence)).toEqual([1, 3])
  const bad = observation(4)
  bad.frequencyHz.value = Number.NaN
  host.send?.({ payload: { status: 'ready', data: bad } })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  host.send?.({ payload: { status: 'ready', data: observation(5) } })
  expect(receive.mock.lastCall?.[0].data.sequence).toBe(5)
  await dispose()
  expect(host.send).toBeNull()
})
it('accepts unchanged fresh sensor markers but rejects stale markers', async () => {
  const data = observation(2)
  data.sampledAt = 102000
  data.history = [
    {
      sequence: 1,
      timestamp: 100000,
      percent: 25.5,
      temperatureCelsius: 42,
      temperatureUpdatedAt: 100000
    },
    {
      sequence: 2,
      timestamp: 102000,
      percent: 25.5,
      temperatureCelsius: null,
      temperatureUpdatedAt: 100000
    }
  ]
  host.initial = { status: 'ready', data }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('cpu', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('ready')
  host.send?.({
    payload: {
      status: 'ready',
      data: {
        ...data,
        sequence: 3,
        history: [
          {
            sequence: 3,
            timestamp: 102000,
            percent: 25.5,
            temperatureCelsius: null,
            temperatureUpdatedAt: 90000
          }
        ]
      }
    }
  })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  await dispose()
})
