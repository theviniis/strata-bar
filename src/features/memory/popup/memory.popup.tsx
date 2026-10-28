import { BigNumbers } from '@/components/big-numbers'
import { mapDataStatus } from '@/components/popup-status'
import { ResourceGraph } from '@/components/resource-graph'
import { definePopup } from '@/popups/definition'
import type { SystemEvent } from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'
import { Activity, Gauge } from 'lucide-react'
import { formatMemoryMetric } from '../src/presentation'
import { MemoryPopupController } from './memory.popup.controller'

export function MemoryPopup({
  event,
  now,
  lastData,
  demo
}: {
  event: SystemEvent<MemoryData>
  now: number
  lastData: MemoryData | undefined
  demo: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data) return mapDataStatus('memória', event.status)
  const fields = [
    ['Memória total', data.totalBytes, 'bytes'],
    ['Em cache', data.cachedBytes, 'bytes'],
    ['Arquivo de paginação em uso', data.pagingFileBytes, 'bytes'],
    ['Utilização', data.percent, 'percent']
  ] as const
  return (
    <section aria-label="Detalhes da memória" className="p-4 w-90">
      <div>
        {demo && (
          <p className="text-body text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {event.status === 'error' && (
          <p role="status" className="mb-3 text-body text-destructive">
            {event.error} · última leitura desatualizada
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 mb-1">
        <BigNumbers.Root>
          <BigNumbers.Header className="text-chart-1">
            <BigNumbers.Icon icon={Activity} />
            <BigNumbers.Title>Em uso</BigNumbers.Title>
            <BigNumbers.Description>GiB</BigNumbers.Description>
          </BigNumbers.Header>
          <BigNumbers.Output error={data.usedBytes.error}>
            {formatMemoryMetric(
              data.usedBytes,
              'bytes',
              now,
              event.status === 'ready',
              false
            )}
          </BigNumbers.Output>
        </BigNumbers.Root>

        <BigNumbers.Root>
          <BigNumbers.Header className="text-chart-5">
            <BigNumbers.Icon icon={Gauge} />
            <BigNumbers.Title>Disponível</BigNumbers.Title>
            <BigNumbers.Description>GiB</BigNumbers.Description>
          </BigNumbers.Header>
          <BigNumbers.Output error={data.availableBytes.error}>
            {formatMemoryMetric(
              data.availableBytes,
              'bytes',
              now,
              event.status === 'ready',
              false
            )}
          </BigNumbers.Output>
        </BigNumbers.Root>
      </div>
      <ResourceGraph
        points={data.history.map((point) => ({
          ...point,
          value: point.percent
        }))}
        now={now}
        label="Utilização"
        description="Utilização da memória"
        unit="%"
      />
      <dl className="grid grid-cols-2 gap-3 text-body">
        {fields.map(([label, metric, unit]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              title={metric.error ?? undefined}
              className="mt-1 font-medium tabular-nums"
            >
              {formatMemoryMetric(metric, unit, now, event.status === 'ready')}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default definePopup({
  label: 'Memória',
  Content: MemoryPopupController
})
