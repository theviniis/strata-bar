import { ResourceGraph } from '@/components/ResourceGraph'
import {
  newestTimestamp,
  projectResourceWindow
} from '@/components/resource-graph'
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import type { SystemEvent } from '@/services/system/bridge'
import type { GpuData } from '@/services/system/gpu.generated'
import { useState } from 'react'
import {
  formatGpuMemoryPair,
  formatGpuMetric,
  isGpuMetricStale
} from './presentation'

export function GpuPopup() {
  const { mode } = usePopupContext('gpu')
  return mode === 'native' ? <NativeGpuPopup /> : <DemoGpuPopup />
}
function NativeGpuPopup() {
  return <GpuPopupContent {...useResourceChannel('gpu')} />
}
function DemoGpuPopup() {
  const [at] = useState(Date.now)
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  const data: GpuData = {
    sequence: 61,
    sampledAt: at,
    adapter: {
      name: 'GeForce RTX 3060 Ti',
      vendorId: 4318,
      deviceId: 9353,
      dedicatedBytes: 8589934592
    },
    percent: metric(27.3),
    memoryUsedBytes: metric(1610612736),
    memoryTotalBytes: metric(8589934592),
    sharedUsedBytes: metric(337641472),
    sharedTotalBytes: metric(17179869184),
    temperatureCelsius: metric(51),
    powerWatts: metric(20.6),
    fanPercent: metric(0),
    temperatureSensor: {
      provider: 'msiAfterburner',
      sourceId: 0,
      gpu: 0,
      name: 'GeForce RTX 3060 Ti'
    },
    history: Array.from({ length: 61 }, (_, i) => ({
      sequence: i + 1,
      timestamp: at - (60 - i) * 2000,
      percent: 27.3 + Math.sin(i / 4) * 12,
      temperatureCelsius: 51 + Math.sin(i / 6) * 6,
      temperatureUpdatedAt: at - (60 - i) * 2000
    }))
  }
  return <GpuPopupContent event={{ status: 'ready', data }} now={at} demo />
}
export function GpuPopupContent({
  event,
  lastData,
  now = 0,
  demo = false
}: {
  event: SystemEvent<GpuData>
  lastData?: GpuData
  now?: number
  demo?: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data)
    return (
      <p role="status" className="w-80 p-4">
        {event.status === 'loading' ? 'Carregando GPU' : 'GPU indisponível'}
      </p>
    )
  const ready = event.status === 'ready'
  const format = (
    metric: GpuData['percent'],
    unit: Parameters<typeof formatGpuMetric>[1]
  ) => formatGpuMetric(metric, unit, now, ready)
  const temperaturePoints = data.history
    .filter(
      (p) => p.temperatureCelsius !== null || p.temperatureUpdatedAt === null
    )
    .map((p) => ({
      sequence: p.sequence,
      timestamp: p.temperatureUpdatedAt ?? p.timestamp,
      value: p.temperatureCelsius
    }))
  // As for the CPU, the scale and the line share one window anchored to the
  // newest observation instead of the clock.
  const observed = projectResourceWindow(
    temperaturePoints,
    newestTimestamp(temperaturePoints, now)
  ).samples
  const maximum = Math.max(
    100,
    Math.ceil(Math.max(0, ...observed.map((p) => p.value ?? 0)) / 10) * 10
  )
  const fields = [
    ['Uso', format(data.percent, 'percent'), data.percent.error],
    [
      'Memória dedicada',
      formatGpuMemoryPair(
        data.memoryUsedBytes,
        data.memoryTotalBytes,
        now,
        ready
      ),
      data.memoryUsedBytes.error ?? data.memoryTotalBytes.error
    ],
    [
      'Temperatura',
      format(data.temperatureCelsius, 'temperature'),
      data.temperatureCelsius.error
    ],
    ['Consumo', format(data.powerWatts, 'watts'), data.powerWatts.error],
    ['Ventoinha', format(data.fanPercent, 'percent'), data.fanPercent.error],
    [
      'Memória compartilhada',
      formatGpuMemoryPair(
        data.sharedUsedBytes,
        data.sharedTotalBytes,
        now,
        ready
      ),
      data.sharedUsedBytes.error ?? data.sharedTotalBytes.error
    ]
  ] as const
  const temperatureStale = isGpuMetricStale(data.temperatureCelsius, now, ready)
  return (
    <section aria-label="Detalhes da GPU">
      <CardHeader>
        <CardTitle>GPU</CardTitle>
        <CardDescription>
          Utilização, memória, temperatura e consumo da placa
        </CardDescription>
        {demo && (
          <p className="text-xs text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {event.status === 'error' && (
          <p role="status" className="text-xs text-destructive">
            {event.error} · última leitura desatualizada
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResourceGraph
          points={data.history.map((p) => ({ ...p, value: p.percent }))}
          now={now}
          label="Utilização"
          description="Utilização da GPU"
          unit="%"
        />
        <ResourceGraph
          points={temperaturePoints}
          now={now}
          label="Temperatura"
          description="Temperatura da GPU"
          unit="°C"
          maxGapMs={6000}
          maximum={maximum}
          color="var(--chart-5)"
        />
        <dl className="grid grid-cols-2 gap-3 text-xs">
          {fields.map(([label, value, error]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd
                title={error ?? undefined}
                className="mt-1 font-medium tabular-nums"
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[10px] text-muted-foreground">
          {data.adapter ? `${data.adapter.name} · ` : ''}
          {data.temperatureSensor && !temperatureStale
            ? `MSI Afterburner · ${data.temperatureSensor.name}`
            : 'Temperatura, consumo e ventoinha requerem MSI Afterburner'}
        </p>
      </CardContent>
    </section>
  )
}
