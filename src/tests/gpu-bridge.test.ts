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
  invoke: async () => ({ token: 'gpu-test', initial: host.initial })
}))
import { createNativeBridge } from '@/services/system/bridge'
import type { GpuData } from '@/services/system/gpu.generated'

function observation(sequence: number): GpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: 100000,
    error: null
  })
  return {
    sequence,
    sampledAt: 100000,
    adapter: {
      name: 'GeForce RTX 3060 Ti',
      vendorId: 4318,
      deviceId: 9353,
      dedicatedBytes: 8589934592
    },
    percent: metric(27.3),
    memoryUsedBytes: metric(1610612736),
    memoryTotalBytes: metric(8589934592),
    sharedUsedBytes: metric(337641472),
    sharedTotalBytes: metric(17179869184),
    temperatureCelsius: {
      status: 'unavailable',
      value: null,
      updatedAt: null,
      error: 'Not running'
    },
    powerWatts: {
      status: 'unavailable',
      value: null,
      updatedAt: null,
      error: 'Not running'
    },
    fanPercent: {
      status: 'unavailable',
      value: null,
      updatedAt: null,
      error: 'Not running'
    },
    temperatureSensor: null,
    history: []
  }
}
it('rejects malformed GPU data without substituting demo values', async () => {
  host.initial = { status: 'ready', data: { percent: 123 } }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('gpu', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  expect(receive.mock.lastCall?.[0].error).toMatch(/GPU/)
  await dispose()
})
it('ignores older snapshots, recovers from invalid readings and releases the listener', async () => {
  host.initial = { status: 'ready', data: observation(1) }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('gpu', receive)
  for (const sequence of [3, 3, 2])
    host.send?.({ payload: { status: 'ready', data: observation(sequence) } })
  expect(receive.mock.calls.map(([e]) => e.data.sequence)).toEqual([1, 3])
  const bad = observation(4)
  bad.percent.value = Number.NaN
  host.send?.({ payload: { status: 'ready', data: bad } })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  host.send?.({ payload: { status: 'ready', data: observation(5) } })
  expect(receive.mock.lastCall?.[0].data.sequence).toBe(5)
  await dispose()
  expect(host.send).toBeNull()
})
it('accepts a stopped fan and bounded power while rejecting impossible readings', async () => {
  const data = observation(1)
  data.fanPercent = {
    status: 'ready',
    value: 0,
    updatedAt: 100000,
    error: null
  }
  data.powerWatts = {
    status: 'ready',
    value: 20.6,
    updatedAt: 100000,
    error: null
  }
  host.initial = { status: 'ready', data }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('gpu', receive)
  // A zero-RPM curve is a real reading, not a missing sensor.
  expect(receive.mock.lastCall?.[0].status).toBe('ready')
  host.send?.({
    payload: {
      status: 'ready',
      data: {
        ...data,
        sequence: 2,
        fanPercent: { ...data.fanPercent, value: 101 }
      }
    }
  })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  await dispose()
})
it('accepts a repeated temperature marker but rejects a stale one', async () => {
  const data = observation(2)
  data.sampledAt = 102000
  data.temperatureCelsius = {
    status: 'ready',
    value: 51,
    updatedAt: 100000,
    error: null
  }
  data.temperatureSensor = {
    provider: 'libreHardwareMonitor',
    hardwareId: '/hardware/0',
    sensorId: '/hardware/0/temperature/0',
    name: 'GeForce RTX 3060 Ti'
  }
  data.history = [
    {
      sequence: 1,
      timestamp: 100000,
      percent: 27.3,
      temperatureCelsius: 51,
      temperatureUpdatedAt: 100000
    },
    {
      sequence: 2,
      timestamp: 102000,
      percent: 30,
      temperatureCelsius: null,
      temperatureUpdatedAt: 100000
    }
  ]
  host.initial = { status: 'ready', data }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('gpu', receive)
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
            percent: 30,
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
it('accepts the full two-minute history and rejects observations outside that window', async () => {
  const data = observation(61)
  data.sampledAt = 220000
  data.percent.updatedAt = 220000
  data.history = Array.from({ length: 61 }, (_, i) => ({
    sequence: i + 1,
    timestamp: 100000 + i * 2000,
    percent: 27.3,
    temperatureCelsius: null,
    temperatureUpdatedAt: null
  }))
  host.initial = { status: 'ready', data }
  const receive = vi.fn()
  const dispose = await createNativeBridge().subscribe('gpu', receive)
  expect(receive.mock.lastCall?.[0].status).toBe('ready')
  expect(receive.mock.lastCall?.[0].data.history).toHaveLength(61)
  host.send?.({
    payload: {
      status: 'ready',
      data: { ...data, sequence: 62, sampledAt: 222000 }
    }
  })
  expect(receive.mock.lastCall?.[0].status).toBe('error')
  await dispose()
})
