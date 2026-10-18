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
import type { CpuData } from '@/services/system/cpu.generated'
import { useState } from 'react'
import { formatCpuMetric } from './presentation'

export function CpuPopup() {
  const { mode } = usePopupContext('cpu')
  return mode === 'native' ? <NativeCpuPopup /> : <DemoCpuPopup />
}
function NativeCpuPopup() {
  return <CpuPopupContent {...useResourceChannel('cpu')} />
}
function DemoCpuPopup() {
  const [at] = useState(Date.now)
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  const data: CpuData = {
    sequence: 30,
    sampledAt: at,
    percent: metric(25.5),
    frequencyHz: metric(3.98e9),
    maxFrequencyHz: metric(2.9e9),
    physicalCores: metric(6),
    logicalProcessors: metric(12),
    temperatureCelsius: metric(42.5),
    temperatureSensor: {
      provider: 'msiAfterburner',
      sourceId: 128,
      instance: 4294967295,
      name: 'CPU temperature'
    },
    history: Array.from({ length: 30 }, (_, i) => ({
      sequence: i + 1,
      timestamp: at - (29 - i) * 2000,
      percent: 25.5 + Math.sin(i / 4) * 8,
      temperatureCelsius: 42.5 + Math.sin(i / 6) * 4,
      temperatureUpdatedAt: at - (29 - i) * 2000
    }))
  }
  return <CpuPopupContent event={{ status: 'ready', data }} now={at} demo />
}
export function CpuPopupContent({
  event,
  lastData,
  now = 0,
  demo = false
}: {
  event: SystemEvent<CpuData>
  lastData?: CpuData
  now?: number
  demo?: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data)
    return (
      <p role="status" className="w-80 p-4">
        {event.status === 'loading' ? 'Carregando CPU' : 'CPU indisponível'}
      </p>
    )
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
    <section aria-label="Detalhes da CPU">
      <CardHeader>
        <CardTitle>CPU</CardTitle>
        <CardDescription>
          Utilização, frequência e temperatura do processador
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
          {data.temperatureSensor
            ? `MSI Afterburner · ${data.temperatureSensor.name}`
            : 'Temperatura requer MSI Afterburner com o sensor do pacote ativo'}
        </p>
      </CardContent>
    </section>
  )
}
