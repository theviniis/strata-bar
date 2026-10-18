export type ResourceGraphPoint = {
  sequence: number
  timestamp: number
  value: number | null
}

/** Seconds of history the trailing window covers. */
const WINDOW_MS = 60000
/** A longer silence than one polling interval breaks the line. */
const GAP_MS = 3000

export interface ResourceSeriesPoint {
  /** Seconds from the start of the window (0 = 60 s ago). */
  offset: number
  value: number | null
}

/**
 * End of the trailing window: the newest observation, or `fallback` when none
 * arrived yet. Readings arrive every two seconds while the clock ticks every
 * second, so the tick that precedes a reading is always behind it — a window
 * anchored to the clock dropped that reading as future-dated for up to a
 * second and moved one edge per tick while the next reading moved the other.
 */
export function newestTimestamp(
  points: ResourceGraphPoint[],
  fallback: number
) {
  if (!points.length) return fallback
  return points.reduce(
    (latest, point) => (point.timestamp > latest ? point.timestamp : latest),
    -Infinity
  )
}

/**
 * Projects observed points onto the trailing 60-second window ending at
 * `windowEnd` (the caller decides whether that is the wall clock or the newest
 * reading). Missing readings, and gaps longer than one polling interval,
 * become `null` samples so the chart breaks the line instead of drawing an
 * invented segment.
 */
export function projectResourceWindow(
  points: ResourceGraphPoint[],
  windowEnd: number,
  maxGapMs = GAP_MS
) {
  const samples = points.filter(
    (point) =>
      point.timestamp >= windowEnd - WINDOW_MS && point.timestamp <= windowEnd
  )
  const series: ResourceSeriesPoint[] = []
  let previous: ResourceGraphPoint | undefined
  for (const point of samples) {
    const offset = (point.timestamp - windowEnd + WINDOW_MS) / 1000
    if (point.value === null) {
      series.push({ offset, value: null })
      previous = undefined
      continue
    }
    if (previous && point.timestamp - previous.timestamp > maxGapMs) {
      series.push({
        offset: offset - (point.timestamp - previous.timestamp) / 2000,
        value: null
      })
    }
    series.push({ offset, value: point.value })
    previous = point
  }
  return { samples, series }
}
