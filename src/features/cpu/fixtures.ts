import type { CpuData } from '@/services/system/cpu.generated'

export const CPU_FIXTURE_TIME = 1000000
export function cpuFixture(at = CPU_FIXTURE_TIME): CpuData {
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  return {
    sequence: 61,
    sampledAt: at,
    percent: metric(25.5),
    frequencyHz: metric(3.98e9),
    maxFrequencyHz: metric(2.9e9),
    physicalCores: metric(6),
    logicalProcessors: metric(12),
    temperatureCelsius: metric(42.5),
    temperatureSensor: {
      provider: 'msiAfterburner',
      sourceId: 128,
      instance: 4294967295,
      name: 'CPU temperature'
    },
    history: Array.from({ length: 61 }, (_, i) => ({
      sequence: i + 1,
      timestamp: at - (60 - i) * 2000,
      percent: 25.5 + Math.sin(i / 4) * 8,
      temperatureCelsius: 42.5 + Math.sin(i / 6) * 4,
      temperatureUpdatedAt: at - (60 - i) * 2000
    }))
  }
}
