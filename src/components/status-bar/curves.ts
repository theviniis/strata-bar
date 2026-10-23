import type { Config } from '@/services/configuration/config'

export function cornerRadius(bar: Config['bar']) {
  return Math.min(bar.cornerRadius ?? bar.height / 2, bar.height / 2)
}

/** Two circular arcs with a straight join when the bar is taller than 2r. */
export function groupEdgeMask(height: number, radius: number) {
  if (radius === 0) return undefined
  const width = radius * 2
  const path = `M${width} 0H0A${radius} ${radius} 0 0 1 ${radius} ${radius}V${height - radius}A${radius} ${radius} 0 0 0 ${width} ${height}Z`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><path fill="white" d="${path}"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / 100% 100% no-repeat`
}
