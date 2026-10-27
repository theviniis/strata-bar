import { definePopup } from '@/popups/definition'
import { ResourceGraph } from '@/components/resource-graph'
import { mapDataStatus } from '@/components/popup-status'
import {
  newestTimestamp,
  projectResourceWindow
} from '@/components/resource-graph-utils'
import type { SystemEvent } from '@/services/system/bridge'
import type { GpuData } from '@/services/system/gpu.generated'
import {
  formatGpuMemoryPair,
  formatGpuMetric,
  isGpuMetricStale
} from '../src/presentation'
import { GpuPopupController } from './gpu.popup.controller'

export function GpuPopup({
  event,
  lastData,
  now,
  demo
}: {
  event: SystemEvent<GpuData>
  lastData: GpuData | undefined
  now: number
  demo: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data) return mapDataStatus('GPU', event.status)

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
    <section className="p-4" aria-label="Detalhes da GPU">
      <div>
        {demo && (
          <p className="text-body text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {event.status === 'error' && (
          <p role="status" className="text-body text-destructive">
            {event.error} · última leitura desatualizada
          </p>
        )}
      </div>
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
      <dl className="grid grid-cols-2 gap-3 text-body">
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
      <p className="mt-3 text-body text-muted-foreground">
        {data.adapter ? `${data.adapter.name} · ` : ''}
        {data.temperatureSensor && !temperatureStale
          ? `Libre Hardware Monitor · ${data.temperatureSensor.name}`
          : 'Sensores de temperatura, consumo e ventoinha indispon�veis'}
      </p>
    </section>
  )
}

export default definePopup({
  label: 'GPU',
  Content: GpuPopupController
})
