import type { SystemEvent } from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'
import { usePopupContext } from '@/popups/context'
import { useMemory } from './useMemory'
import { MemoryGraph } from './MemoryGraph'
import { useState } from 'react'

export function MemoryPopup() {
  const { mode } = usePopupContext('memory')
  return mode === 'native' ? <NativeMemoryPopup /> : <DemoMemoryPopup />
}
function NativeMemoryPopup() {
  return <MemoryPopupContent {...useMemory()} />
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
    sequence: 30,
    sampledAt: at,
    totalBytes: metric(17179869184),
    availableBytes: metric(7516192768),
    usedBytes: metric(9126805504),
    cachedBytes: metric(4294967296),
    pagingFileBytes: metric(1073741824),
    percent: metric(53.125),
    history: Array.from({ length: 30 }, (_, index) => ({
      sequence: index + 1,
      timestamp: at - (29 - index) * 2000,
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
    ['Em uso', data.usedBytes],
    ['Memória total', data.totalBytes],
    ['Em cache', data.cachedBytes],
    ['Disponível', data.availableBytes],
    ['Arquivo de paginação em uso', data.pagingFileBytes],
    ['Utilização', data.percent]
  ] as const
  return (
    <section aria-label="Detalhes da memória" className="w-80 p-4">
      <h2 className="mb-3 text-sm font-semibold">Memória</h2>
      {demo && (
        <p className="mb-3 text-xs text-muted-foreground">
          Dados de demonstração · sem acesso ao sistema
        </p>
      )}
      {event.status === 'error' && (
        <p role="status" className="mb-3 text-xs text-destructive">
          {event.error} · última leitura desatualizada
        </p>
      )}
      <MemoryGraph history={data.history} now={now} />
      <dl className="grid grid-cols-2 gap-3 text-xs">
        {fields.map(([label, metric]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd
              title={metric.error ?? undefined}
              className="mt-1 font-medium tabular-nums"
            >
              {metric.status === 'notConfigured'
                ? 'Não configurado'
                : metric.value === null
                  ? 'Indisponível'
                  : `${label === 'Utilização' ? `${metric.value.toFixed(1)}%` : `${(metric.value / 1073741824).toFixed(1)} GiB`}${metric.status !== 'ready' || event.status !== 'ready' || now - (metric.updatedAt ?? 0) > 6000 ? ' · desatualizada' : ''}`}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
