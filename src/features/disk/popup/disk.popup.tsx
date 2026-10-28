import { mapDataStatus } from '@/components/popup-status'
import { Progress } from '@/components/ui/progress'
import { definePopup } from '@/popups/definition'
import type { SystemEvent } from '@/services/system/bridge'
import type { DiskData } from '@/services/system/disk.generated'
import { HardDrive } from 'lucide-react'
import { formatDiskBytes, isDiskStale, localVolumes } from '../src/presentation'
import { DiskPopupController } from './disk.popup.controller'

export interface DiskPopupProps {
  event: SystemEvent<DiskData>
  lastData: DiskData | undefined
  now: number
  demo: boolean
}

export function DiskPopup({ event, lastData, now, demo }: DiskPopupProps) {
  const data = event.status === 'ready' ? event.data : lastData
  if (!data) return mapDataStatus('discos', event.status)
  const volumes = localVolumes(data.volumes)
  return (
    <section aria-label="Detalhes dos discos" className="p-4 w-90">
      <div>
        {demo && (
          <p className="text-body text-muted-foreground">
            Dados de demonstração · ilustrativos
          </p>
        )}
        {isDiskStale(data, now, event.status === 'ready') && (
          <p role="status" className="text-body text-destructive">
            {event.status === 'error' ? `${event.error} · ` : ''}última leitura
            desatualizada
          </p>
        )}
      </div>
      {volumes.length ? (
        <ul className="flex w-80 flex-col gap-3 text-body">
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
        <p className="text-body text-muted-foreground">
          Nenhum disco disponível
        </p>
      )}
    </section>
  )
}

export default definePopup({
  label: 'Discos',
  Content: DiskPopupController
})
