import { ResourceGraph } from '@/components/ResourceGraph'
import { mapDataStatus } from '@/components/popup-status'
import {
  newestTimestamp,
  projectResourceWindow
} from '@/components/resource-graph'
import type { SystemEvent } from '@/services/system/bridge'
import type { CpuData } from '@/services/system/cpu.generated'
import { formatCpuMetric } from './presentation'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import { cpuFixture } from './fixtures'
import { useState } from 'react'

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
    unit: Parameters<typeof formatCpuMetric>[1]
  ) => formatCpuMetric(metric, unit, now, ready)
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
    ['Uso', format(data.percent, 'percent'), data.percent.error],
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
    ],
    [
      'Temperatura do pacote',
      format(data.temperatureCelsius, 'temperature'),
      data.temperatureCelsius.error
    ]
  ] as const
  return (
    <section className="p-4" aria-label="Detalhes da CPU">
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

export function CpuPopupController() {
  const { mode } = usePopupContext('cpu')
  return mode === 'native' ? <NativeCpuPopup /> : <DemoCpuPopup />
}
function NativeCpuPopup() {
  const reading = useResourceChannel('cpu')
  return <CpuPopup {...reading} lastData={reading.lastData} demo={false} />
}
function DemoCpuPopup() {
  const [at] = useState(Date.now)
  const data = cpuFixture(at)
  return (
    <CpuPopup
      event={{ status: 'ready', data }}
      lastData={undefined}
      now={at}
      demo
    />
  )
}
