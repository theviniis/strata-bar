import { showLabel } from '@/components/status-bar/presentation'
import { Progress } from '@/components/ui/progress'
import {
  WidgetItem,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import type { WidgetConfig } from '@/services/configuration/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import type { DiskVolume } from '@/services/system/disk.generated'
import { HardDrive } from 'lucide-react'
import { isDiskStale, localVolumes } from './presentation'

/** The bar shows whole percentages; the exact ratio stays in the tooltip. */
function wholePercent(volume: DiskVolume) {
  return Math.round(volume.percent)
}

/** One row per mounted volume; shared by the native bar and the studio demo. */
export function DiskBar({
  volumes,
  compact
}: {
  volumes: DiskVolume[]
  /** `compact` keeps the bars and hides the mount/percentage text. */
  compact: boolean
}) {
  if (!volumes.length)
    return <span className="text-bar text-muted-foreground">—</span>
  return (
    <>
      {volumes.map((volume) => (
        <span key={volume.mount} className="flex items-center gap-1.5">
          <HardDrive size={14} className="shrink-0 text-secondary" />
          {!compact && (
            <WidgetItemOutput className="whitespace-nowrap tabular-nums">
              {volume.mount} {wholePercent(volume)}%
            </WidgetItemOutput>
          )}
          <Progress
            value={wholePercent(volume)}
            aria-label={`Uso do disco ${volume.mount}`}
            className="h-1.5 w-14 bg-muted"
          />
        </span>
      ))}
    </>
  )
}

export interface DiskProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['disk']>
  lastData: ChannelData['disk'] | undefined
  now: number
  format: WidgetConfig['format']
  describedBy: string | undefined
}
export function Disk({
  event,
  lastData,
  now,
  format,
  describedBy,
  ...triggerProps
}: DiskProps) {
  const data = event.status === 'ready' ? event.data : lastData
  const volumes = localVolumes(data?.volumes ?? [])
  return (
    <WidgetItem
      aria-label="Detalhes dos discos"
      aria-describedby={describedBy}
      className="gap-3"
      {...triggerProps}
    >
      {event.status === 'loading' && !data ? (
        <span>...</span>
      ) : (
        <DiskBar volumes={volumes} compact={!showLabel(format)} />
      )}
      {data && isDiskStale(data, now, event.status === 'ready') && (
        <span aria-label="Leitura desatualizada">*</span>
      )}
    </WidgetItem>
  )
}
