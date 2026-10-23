import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import type { SystemEvent } from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'
import { MemoryGraph } from './MemoryGraph'
import { formatMemoryMetric } from './presentation'

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
          <p className="text-caption text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {event.status === 'error' && (
          <p role="status" className="mb-3 text-caption text-destructive">
            {event.error} · última leitura desatualizada
          </p>
        )}
      </CardHeader>
      <CardContent>
        <MemoryGraph history={data.history} now={now} />
        <dl className="grid grid-cols-2 gap-3 text-caption">
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
