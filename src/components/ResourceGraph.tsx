import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import { cn } from '@/lib/utils'
import {
  newestTimestamp,
  projectResourceWindow,
  type ResourceGraphPoint
} from './resource-graph'

export function ResourceGraph({
  points,
  now,
  label,
  description,
  unit,
  maximum = 100,
  maxGapMs = 3000,
  color = 'var(--chart-1)',
  className
}: {
  points: ResourceGraphPoint[]
  now: number
  label: string
  description: string
  unit: '%' | '°C'
  maximum?: number
  /** Maximum silence between observations before the line is interrupted. */
  maxGapMs?: number
  /** Colour of the line; any CSS colour, by default the chart-1 token. */
  color?: string
  /** Extra classes for the chart surface, e.g. to override the line stroke. */
  className?: string
}) {
  // The readings alone own the window; the clock only reports age. A
  // clock-anchored window dropped the reading that landed just after a tick as
  // future-dated and moved one edge per tick while the next reading moved the
  // other, so the chart stretched and snapped back on every poll.
  const anchor = newestTimestamp(points, now)
  const { samples, series } = projectResourceWindow(points, anchor, maxGapMs)
  const missing = samples.filter((point) => point.value === null).length
  // The window is drawn across the observed extent, so the area reaches the
  // container edges instead of leaving a gap the width of the polling
  // interval. A single reading has no extent to fill.
  const window: [number | string, number | string] =
    samples.length > 1 ? ['dataMin', 'dataMax'] : [0, 60]
  const format = (value: number) =>
    `${value.toFixed(1)}${unit === '%' ? '' : ' '}${unit}`
  const scale = `${maximum}${unit === '%' ? '' : ' '}${unit}`
  const chartConfig = {
    value: { label, color }
  } satisfies ChartConfig
  return (
    <div className="mb-4">
      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{label} · 60 segundos</span>
        <span>{scale}</span>
      </div>
      <ChartContainer
        config={chartConfig}
        className={cn(
          'aspect-auto h-28 w-full rounded border border-border bg-muted/20',
          className
        )}
        role="group"
        aria-label={`${description} nos últimos 60 segundos, escala de 0 a ${scale}`}
      >
        <AreaChart
          accessibilityLayer
          data={series}
          margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="offset"
            type="number"
            domain={window}
            padding={{ left: 0, right: 0 }}
            hide
          />
          <YAxis domain={[0, maximum]} hide />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                indicator="dot"
                labelFormatter={(_value, payload) => {
                  const offset = payload?.[0]?.payload?.offset
                  if (typeof offset !== 'number') return 'Histórico observado'
                  // Age is measured against the clock, not against the
                  // window's own end, so a reading that landed a second ago
                  // does not claim to be from this instant. Afterburner
                  // reports whole seconds, so it can sit a moment ahead of a
                  // clock that was last read before it landed.
                  const age = 60 - offset + (now - anchor) / 1000
                  return `${Math.max(0, Math.round(age))} s atrás`
                }}
                formatter={(value) =>
                  typeof value === 'number' ? format(value) : String(value)
                }
              />
            }
          />
          <Area
            dataKey="value"
            type="linear"
            fill="var(--color-value)"
            fillOpacity={0.4}
            stroke="var(--color-value)"
            // Readings arrive every 2 s; the enter animation would restart on
            // every sample and make a sliding window look like it is stuttering.
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>60 s atrás</span>
        <span>Agora · 0{unit}</span>
      </div>
      {missing > 0 && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {missing}{' '}
          {missing === 1 ? 'leitura indisponível' : 'leituras indisponíveis'} ·
          lacunas preservadas
        </p>
      )}
      {!samples.length && (
        <p className="mt-1 text-xs text-muted-foreground">
          Aguardando histórico observado
        </p>
      )}
    </div>
  )
}
