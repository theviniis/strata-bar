import type {
  NetworkPoint,
  NetworkUnit
} from '@/services/system/network.generated'
const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
export function formatRate(
  bytes: number | null | undefined,
  unit: NetworkUnit = 'bytes'
) {
  if (bytes == null) return '—'
  let value = bytes * (unit === 'bits' ? 8 : 1)
  const suffixes =
    unit === 'bits'
      ? ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
      : ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  let index = 0
  while (value >= 1000 && index < suffixes.length - 1) {
    value /= 1000
    index++
  }
  return `${number.format(value)} ${suffixes[index]}`
}
export function formatBytes(bytes: number) {
  return formatRate(bytes).replace('/s', '')
}
export function metric(value: number | null | undefined, unit: string) {
  return value == null ? '—' : `${number.format(value)} ${unit}`
}
export function networkSeries(points: NetworkPoint[]) {
  const series: NetworkPoint[] = []
  for (const point of points) {
    const last = series.at(-1)
    if (last && point.timestamp - last.timestamp > 3000)
      series.push({
        timestamp: last.timestamp + 1,
        download: null,
        upload: null
      })
    series.push(point)
  }
  return series
}
export function graphMaximum(points: NetworkPoint[]) {
  const peak = Math.max(
    1,
    ...points.flatMap((p) => [p.download ?? 0, p.upload ?? 0])
  )
  const step = 10 ** Math.floor(Math.log10(peak))
  return Math.ceil(peak / step) * step
}
export const testActive = (phase: string) =>
  ['preparing', 'download', 'upload'].includes(phase)
