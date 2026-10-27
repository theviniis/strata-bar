import type { MemoryMetric } from '@/services/system/memory.generated'

export function isMemoryMetricStale(
  metric: MemoryMetric | undefined,
  now: number,
  transportReady = true
) {
  return (
    !transportReady ||
    !metric ||
    (metric.status !== 'ready' && metric.status !== 'notConfigured') ||
    metric.updatedAt === null ||
    now - metric.updatedAt > 6000
  )
}

export function formatMemoryMetric(
  metric: MemoryMetric,
  unit: 'bytes' | 'percent',
  now: number,
  transportReady: boolean
) {
  let text = 'Não configurado'
  if (metric.status !== 'notConfigured') {
    if (metric.value === null) return 'Indisponível'
    text =
      unit === 'percent'
        ? `${metric.value.toFixed(1)}%`
        : `${(metric.value / 1073741824).toFixed(1)} GiB`
  }
  return isMemoryMetricStale(metric, now, transportReady)
    ? `${text} · desatualizada`
    : text
}
