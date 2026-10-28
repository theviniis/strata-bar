import { BigNumbers } from '@/components/big-numbers'
import { mapDataStatus } from '@/components/popup-status'
import { ResourceGraph } from '@/components/resource-graph'
import {
  newestTimestamp,
  projectResourceWindow
} from '@/components/resource-graph-utils'
import { definePopup } from '@/popups/definition'
import type { SystemEvent } from '@/services/system/bridge'
import type { CpuData } from '@/services/system/cpu.generated'
import { Thermometer, TrendingUp } from 'lucide-react'
import { formatCpuMetric } from '../src/presentation'
import { CpuPopupController } from './cpu.popup.controller'

export function CpuPopup({
  event,
  lastData,
  now,
  demo
}: {
  event: SystemEvent<CpuData>
  lastData: CpuData | undefined
  now: number
  demo: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data) {
    return mapDataStatus('CPU', event.status)
  }
  const ready = event.status === 'ready'
  const format = (
    metric: CpuData['percent'],
    unit: Parameters<typeof formatCpuMetric>[1],
    includeUnit = true
  ) => formatCpuMetric(metric, unit, now, ready, includeUnit)
  const temperaturePoints = data.history
    .filter(
      (p) => p.temperatureCelsius !== null || p.temperatureUpdatedAt === null
    )
    .map((p) => ({
      sequence: p.sequence,
      timestamp: p.temperatureUpdatedAt ?? p.timestamp,
      value: p.temperatureCelsius
    }))
  // The scale and the line share one window, anchored to the newest
  // observation: filtering by the clock made the axis jump on its own whenever
  // the warmest reading aged past a tick.
  const observed = projectResourceWindow(
    temperaturePoints,
    newestTimestamp(temperaturePoints, now)
  ).samples
  const maximum = Math.max(
    100,
    Math.ceil(Math.max(0, ...observed.map((p) => p.value ?? 0)) / 10) * 10
  )
  const fields = [
    [
      'Frequência',
      format(data.frequencyHz, 'frequency'),
      data.frequencyHz.error
    ],
    [
      'Núcleos (P / L)',
      `${format(data.physicalCores, 'cores')} / ${format(data.logicalProcessors, 'cores')}`,
      data.physicalCores.error ?? data.logicalProcessors.error
    ],
    [
      'Frequência máxima nominal',
      format(data.maxFrequencyHz, 'frequency'),
      data.maxFrequencyHz.error
    ]
  ] as const
  return (
    <section className="p-4 w-90" aria-label="Detalhes da CPU">
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
      <div className="grid grid-cols-2 gap-3 mb-1">
        <BigNumbers.Root>
          <BigNumbers.Header className="text-chart-1">
            <BigNumbers.Icon icon={TrendingUp} />
            <BigNumbers.Title>Utilização</BigNumbers.Title>
            <BigNumbers.Description>%</BigNumbers.Description>
          </BigNumbers.Header>
          <BigNumbers.Output error={data.percent.error}>
            {format(data.percent, 'percent', false)}
          </BigNumbers.Output>
        </BigNumbers.Root>

        <BigNumbers.Root>
          <BigNumbers.Header className="text-chart-5">
            <BigNumbers.Icon icon={Thermometer} />
            <BigNumbers.Title>Temperatura</BigNumbers.Title>
            <BigNumbers.Description>°C</BigNumbers.Description>
          </BigNumbers.Header>
          <BigNumbers.Output error={data.temperatureCelsius.error}>
            {format(data.temperatureCelsius, 'temperature', false)}
          </BigNumbers.Output>
        </BigNumbers.Root>
      </div>
      <ResourceGraph
        points={data.history.map((p) => ({ ...p, value: p.percent }))}
        now={now}
        label="Utilização"
        description="Utilização da CPU"
        unit="%"
      />
      <ResourceGraph
        points={temperaturePoints}
        now={now}
        label="Temperatura"
        description="Temperatura do pacote da CPU"
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
        {data.temperatureSensor
          ? `Libre Hardware Monitor · ${data.temperatureSensor.name}`
          : 'Sensor de temperatura indispon�vel'}
      </p>
    </section>
  )
}

export default definePopup({
  label: 'CPU',
  Content: CpuPopupController
})
