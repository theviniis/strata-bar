import { Card, CardContent } from '@/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@/components/ui/chart'
import type {
  NetworkPoint,
  NetworkUnit
} from '@/services/system/network.generated'
import { useState, type CSSProperties } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { NetworkQuantity } from './network-quantity'
import { formatRate, graphMaximum, networkSeries } from './presentation'

const chartConfig = {
  download: { label: 'Download', color: 'var(--chart-1)' },
  upload: { label: 'Upload', color: 'var(--chart-2)' }
} satisfies ChartConfig

export function NetworkGraph({
  points,
  unit = 'bytes',
  now
}: {
  points: NetworkPoint[]
  now?: number
  unit?: NetworkUnit
}) {
  const [legendContainer, setLegendContainer] = useState<HTMLDivElement | null>(
    null
  )
  const maximum = graphMaximum(points)
  const end = points.at(-1)?.timestamp ?? 0
  const clock = now ?? end
  return (
    <div>
      <div className="mb-1 flex justify-between text-micro text-muted-foreground">
        <span>Utilização · 2 minutos</span>
        <span>
          <NetworkQuantity formatted={formatRate(maximum, unit)} />
        </span>
      </div>
      <Card className="bg-transparent shadow-none p-0">
        <CardContent className="flex flex-col p-0">
          <ChartContainer
            config={chartConfig}
            className="glass-surface aspect-auto h-40 w-full rounded border border-border/50 bg-muted/30 shadow-sm shadow-foreground/5"
            role="group"
            aria-label="Download e upload no mesmo gráfico, últimos 2 minutos"
          >
            <LineChart
              accessibilityLayer
              data={networkSeries(points)}
              margin={{ left: 0, right: 0, top: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                type="number"
                domain={[end - 120_000, end]}
                ticks={[end - 120_000, end - 60_000, end]}
                allowDataOverflow
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                height={36}
                tickFormatter={(timestamp) => {
                  const seconds = Math.max(
                    0,
                    Math.round((end - Number(timestamp)) / 1000)
                  )
                  return seconds === 0 ? 'Agora' : `−${seconds} s`
                }}
                hide
              />
              <YAxis domain={[0, maximum]} hide />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(_label, payload) => {
                      const timestamp = payload?.[0]?.payload?.timestamp
                      if (typeof timestamp !== 'number')
                        return 'Histórico observado'
                      return (
                        <>
                          <NetworkQuantity
                            formatted={`${Math.max(0, Math.round((clock - timestamp) / 1000))} s`}
                          />{' '}
                          atrás
                        </>
                      )
                    }}
                    formatter={(value, name, item) => (
                      <div className="flex w-full items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-xs"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-muted-foreground">
                          {name === 'download'
                            ? chartConfig.download.label
                            : chartConfig.upload.label}
                        </span>
                        <span className="ml-auto tabular-nums">
                          <NetworkQuantity
                            formatted={formatRate(
                              typeof value === 'number' ? value : null,
                              unit
                            )}
                          />
                        </span>
                      </div>
                    )}
                  />
                }
              />
              {legendContainer && (
                <ChartLegend
                  portal={legendContainer}
                  content={<ChartLegendContent className="pt-0" />}
                />
              )}
              <Line
                dataKey="download"
                type="monotone"
                stroke="var(--color-download)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
              <Line
                dataKey="upload"
                type="monotone"
                stroke="var(--color-upload)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
          <div className="mt-1 flex justify-between text-micro text-muted-foreground">
            <span>2 min atrás</span>
            <span>Agora</span>
          </div>
          <div
            ref={setLegendContainer}
            role="group"
            aria-label="Legenda do tráfego"
            className="min-h-4 text-body"
            style={
              {
                '--color-download': chartConfig.download.color,
                '--color-upload': chartConfig.upload.color
              } as CSSProperties
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}
