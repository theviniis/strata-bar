import type { GpuMetric } from '@/services/system/gpu.generated'

export function isGpuMetricStale(
  metric: GpuMetric | undefined,
  now: number,
  transportReady = true
) {
  return (
    !transportReady ||
    !metric ||
    metric.status !== 'ready' ||
    metric.updatedAt === null ||
    now - metric.updatedAt > 6000
  )
}

const GIB = 1073741824
const MIB = 1048576

/** Dedicated and shared GPU memory keep memory.js's binary units. */
export function formatGpuBytes(value: number) {
  return value >= GIB
    ? `${(value / GIB).toFixed(1)} GiB`
    : `${(value / MIB).toFixed(1)} MiB`
}

export function formatGpuMetric(
  metric: GpuMetric,
  unit: 'percent' | 'temperature' | 'watts',
  now: number,
  transportReady: boolean
) {
  // A fan stopped by its own zero-RPM curve reports a real `0`, so only a
  // missing value means the sensor itself is unavailable.
  if (metric.value === null) return 'Indisponível'
  const formatters = {
    percent: (v: number) => `${v.toFixed(1)}%`,
    temperature: (v: number) => `${v.toFixed(1)} °C`,
    watts: (v: number) => `${v.toFixed(1)} W`
  }
  const text = formatters[unit](metric.value)
  return isGpuMetricStale(metric, now, transportReady)
    ? `${text} · desatualizada`
    : text
}

/** A used/limit pair reads as one value, so the stale marker appears once. */
export function formatGpuMemoryPair(
  used: GpuMetric,
  total: GpuMetric,
  now: number,
  transportReady: boolean
) {
  if (used.value === null || total.value === null) return 'Indisponível'
  const text = `${formatGpuBytes(used.value)} / ${formatGpuBytes(total.value)}`
  return isGpuMetricStale(used, now, transportReady) ||
    isGpuMetricStale(total, now, transportReady)
    ? `${text} · desatualizada`
    : text
}
