import { mapDataStatus } from '@/components/popup-status'
import type { SystemEvent } from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'
import { MemoryGraph } from './MemoryGraph'
import { formatMemoryMetric } from './presentation'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import { memoryFixture } from './fixtures'
import { useState } from 'react'

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
    ['Em uso', data.usedBytes, 'bytes'],
    ['Memória total', data.totalBytes, 'bytes'],
    ['Em cache', data.cachedBytes, 'bytes'],
    ['Disponível', data.availableBytes, 'bytes'],
    ['Arquivo de paginação em uso', data.pagingFileBytes, 'bytes'],
    ['Utilização', data.percent, 'percent']
  ] as const
  return (
    <section aria-label="Detalhes da memória" className="p-4">
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
      <MemoryGraph history={data.history} now={now} />
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

export function MemoryPopupController() {
  const { mode } = usePopupContext('memory')
  return mode === 'native' ? <NativeMemoryPopup /> : <DemoMemoryPopup />
}
function NativeMemoryPopup() {
  const reading = useResourceChannel('memory')
  return <MemoryPopup {...reading} lastData={reading.lastData} demo={false} />
}
function DemoMemoryPopup() {
  const [at] = useState(Date.now)
  const data = memoryFixture(at)
  return (
    <MemoryPopup
      event={{ status: 'ready', data }}
      lastData={undefined}
      now={at}
      demo
    />
  )
}
