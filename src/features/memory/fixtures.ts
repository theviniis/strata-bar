import type { MemoryData } from '@/services/system/memory.generated'

export const MEMORY_FIXTURE_TIME = 1700000000000

export function memoryFixture(at = MEMORY_FIXTURE_TIME): MemoryData {
  const metric = (value: number): MemoryData['percent'] => ({
    status: 'ready',
    value,
    updatedAt: at,
    error: null
  })
  return {
    sequence: 61,
    sampledAt: at,
    totalBytes: metric(17179869184),
    availableBytes: metric(7516192768),
    usedBytes: metric(9126805504),
    cachedBytes: metric(4294967296),
    pagingFileBytes: metric(1073741824),
    percent: metric(53.125),
    history: Array.from({ length: 61 }, (_, index) => ({
      sequence: index + 1,
      timestamp: at - (60 - index) * 2000,
      percent: 53.125 + Math.sin(index / 4) * 3
    }))
  }
}
