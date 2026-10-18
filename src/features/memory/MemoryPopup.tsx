import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { usePopupContext } from '@/popups/context'
import type { SystemEvent } from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'
import { useState } from 'react'
import { MemoryGraph } from './MemoryGraph'
import { formatMemoryMetric } from './presentation'
import { useResourceChannel } from '@/hooks/useResourceChannel'

export function MemoryPopup() {
  const { mode } = usePopupContext('memory')
  return mode === 'native' ? <NativeMemoryPopup /> : <DemoMemoryPopup />
}
function NativeMemoryPopup() {
  return <MemoryPopupContent {...useResourceChannel('memory')} />
}
function DemoMemoryPopup() {
  const [at] = useState(Date.now)
  const metric = (value: number) => ({
    status: 'ready' as const,
    value,
    updatedAt: at,
    error: null
  })
  const data: MemoryData = {
    sequence: 61,
    sampledAt: at,
    totalBytes: metric(17179869184),
    availableBytes: metric(7516192768),
    usedBytes: metric(9126805504),
    cachedBytes: metric(4294967296),
    pagingFileBytes: metric(1073741824),
    percent: metric(53.125),
    history: Array.from({ length: 61 }, (_, index) => ({
      sequence: index + 1,
      timestamp: at - (60 - index) * 2000,
      percent: 53.125 + Math.sin(index / 4) * 3
    }))
  }
  return <MemoryPopupContent event={{ status: 'ready', data }} now={at} demo />
}

export function MemoryPopupContent({
  event,
  now = 0,
  lastData,
  demo = false
}: {
  event: SystemEvent<MemoryData>
  now?: number
  lastData?: MemoryData
  demo?: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data)
    return (
      <p role="status" className="w-80 p-4">
        {event.status === 'loading'
          ? 'Carregando memória'
          : 'Memória indisponível'}
      </p>
    )
  const fields = [
    ['Em uso', data.usedBytes, 'bytes'],
    ['Memória total', data.totalBytes, 'bytes'],
    ['Em cache', data.cachedBytes, 'bytes'],
    ['Disponível', data.availableBytes, 'bytes'],
    ['Arquivo de paginação em uso', data.pagingFileBytes, 'bytes'],
    ['Utilização', data.percent, 'percent']
  ] as const
  return (
    <section aria-label="Detalhes da memória">
      <CardHeader>
        <CardTitle>Memória</CardTitle>
        <CardDescription>
          Visualize informações sobre a memória RAM
        </CardDescription>
        {demo && (
          <p className="text-xs text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {event.status === 'error' && (
          <p role="status" className="mb-3 text-xs text-destructive">
            {event.error} · última leitura desatualizada
          </p>
        )}
      </CardHeader>
      <CardContent>
        <MemoryGraph history={data.history} now={now} />
        <dl className="grid grid-cols-2 gap-3 text-xs">
          {fields.map(([label, metric, unit]) => (
            <div key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd
                title={metric.error ?? undefined}
                className="mt-1 font-medium tabular-nums"
              >
                {formatMemoryMetric(
                  metric,
                  unit,
                  now,
                  event.status === 'ready'
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </section>
  )
}
