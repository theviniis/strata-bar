import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { usePopupContext } from '@/popups/context'
import type { SystemEvent } from '@/services/system/bridge'
import type { DiskData } from '@/services/system/disk.generated'
import { HardDrive } from 'lucide-react'
import { useState } from 'react'
import { formatDiskBytes, localVolumes } from './presentation'

export function DiskPopup() {
  const { mode } = usePopupContext('disk')
  return mode === 'native' ? <NativeDiskPopup /> : <DemoDiskPopup />
}
function NativeDiskPopup() {
  return <DiskPopupContent {...useResourceChannel('disk')} />
}
function DemoDiskPopup() {
  const [at] = useState(Date.now)
  const volume = (
    mount: string,
    label: string | null,
    total: number,
    free: number
  ) => {
    const used = total - free
    return {
      mount,
      label,
      kind: 'fixed' as const,
      totalBytes: total,
      freeBytes: free,
      usedBytes: used,
      percent: (used / total) * 100
    }
  }
  const data: DiskData = {
    sequence: 61,
    sampledAt: at,
    volumes: [
      volume('C:', 'System', 512_000_000_000, 286_720_000_000),
      volume('D:', 'Data', 1_000_000_000_000, 450_000_000_000)
    ]
  }
  return <DiskPopupContent event={{ status: 'ready', data }} demo />
}

export function DiskPopupContent({
  event,
  lastData,
  demo = false
}: {
  event: SystemEvent<DiskData>
  lastData?: DiskData
  demo?: boolean
}) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data)
    return (
      <p role="status" className="w-80 p-4">
        {event.status === 'loading'
          ? 'Carregando discos'
          : 'Discos indisponíveis'}
      </p>
    )
  const volumes = localVolumes(data.volumes)
  return (
    <section aria-label="Detalhes dos discos">
      <CardHeader>
        <CardTitle>Discos</CardTitle>
        <CardDescription>
          Espaço usado e disponível em cada unidade
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
        {volumes.length ? (
          <ul className="flex w-80 flex-col gap-3 text-xs">
            {volumes.map((volume) => {
              const percent = Math.round(volume.percent)
              return (
                <li key={volume.mount} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <HardDrive
                        size={14}
                        className="shrink-0 text-secondary"
                        aria-hidden="true"
                      />
                      <span className="whitespace-nowrap">{volume.mount}</span>
                      {volume.label && (
                        <span className="truncate font-normal text-muted-foreground">
                          {volume.label}
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {percent}%
                    </span>
                  </div>
                  <Progress
                    value={percent}
                    aria-label={`Uso do disco ${volume.mount}`}
                    className="h-1.5 bg-muted"
                  />
                  <span className="text-muted-foreground tabular-nums">
                    {formatDiskBytes(volume.usedBytes)} de{' '}
                    {formatDiskBytes(volume.totalBytes)} ·{' '}
                    {formatDiskBytes(volume.freeBytes)} livre
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Nenhum disco disponível
          </p>
        )}
      </CardContent>
    </section>
  )
}
