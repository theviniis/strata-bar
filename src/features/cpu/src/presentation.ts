import type { CpuMetric } from '@/services/system/cpu.generated'

export function isCpuMetricStale(
  metric: CpuMetric | undefined,
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
export function formatCpuMetric(
  metric: CpuMetric,
  unit: 'percent' | 'frequency' | 'cores' | 'temperature',
  now: number,
  transportReady: boolean,
  includeUnit = true
) {
  if (metric.value === null) return 'Indisponível'
  const formatters = {
    percent: (v: number) => `${v.toFixed(1)}%`,
    frequency: (v: number) => `${(v / 1e9).toFixed(2)} GHz`,
    cores: (v: number) => v.toFixed(0),
    temperature: (v: number) => `${v.toFixed(1)} °C`
  }
  const text = includeUnit
    ? formatters[unit](metric.value)
    : metric.value.toFixed(1)
  return isCpuMetricStale(metric, now, transportReady)
    ? `${text} · desatualizada`
    : text
}
