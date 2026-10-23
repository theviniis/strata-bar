import type { GpuData } from '@/services/system/gpu.generated'

export const GPU_FIXTURE_TIME = 1000000
export function gpuFixture(at = GPU_FIXTURE_TIME): GpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  const data: GpuData = {
    sequence: 61,
    sampledAt: at,
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
    temperatureCelsius: metric(51),
    powerWatts: metric(20.6),
    fanPercent: metric(0),
    temperatureSensor: {
      provider: 'msiAfterburner',
      sourceId: 0,
      gpu: 0,
      name: 'GeForce RTX 3060 Ti'
    },
    history: Array.from({ length: 61 }, (_, i) => ({
      sequence: i + 1,
      timestamp: at - (60 - i) * 2000,
      percent: 27.3 + Math.sin(i / 4) * 12,
      temperatureCelsius: 51 + Math.sin(i / 6) * 6,
      temperatureUpdatedAt: at - (60 - i) * 2000
    }))
  }
  return data
}
