import { Progress } from '@/components/ui/progress'
import { WidgetItem, WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { showLabel } from '@/components/status-bar/presentation'
import { WidgetPopup } from '@/popups/WidgetPopup'
import type { DiskVolume } from '@/services/system/disk.generated'
import { HardDrive } from 'lucide-react'
import { localVolumes } from './presentation'

/** The bar shows whole percentages; the exact ratio stays in the tooltip. */
function wholePercent(volume: DiskVolume) {
  return Math.round(volume.percent)
}

function describe(volumes: DiskVolume[]) {
  return volumes.length
    ? volumes.map((v) => `${v.mount} ${wholePercent(v)}%`).join(' · ')
    : 'Nenhum disco disponível'
}

/** One row per mounted volume; shared by the native bar and the studio demo. */
export function DiskBar({
  volumes,
  compact = false
}: {
  volumes: DiskVolume[]
  /** `compact` keeps the bars and hides the mount/percentage text. */
  compact?: boolean
}) {
  if (!volumes.length)
    return <span className="text-[11px] text-muted-foreground">—</span>
  return (
    <>
      {volumes.map((volume) => (
        <span key={volume.mount} className="flex items-center gap-1.5">
          <HardDrive size={14} className="shrink-0 text-secondary" />
          {!compact && (
            <span className="text-[11px] whitespace-nowrap tabular-nums">
              {volume.mount} {wholePercent(volume)}%
            </span>
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

export function Disk() {
  const view = useWidgetView()
  const { event, lastData } = useResourceChannel('disk', view.intervalMs)
  const data = event.status === 'ready' ? event.data : lastData
  const volumes = localVolumes(data?.volumes ?? [])
  const text = event.status === 'error' ? event.error : describe(volumes)
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="disk">
      <WidgetPopup.Trigger asChild>
        <WidgetItem
          aria-label="Detalhes dos discos"
          className="gap-3"
          {...tip.trigger}
        >
          <DiskBar volumes={volumes} compact={!showLabel(view.format)} />
          {view.tooltip && (
            <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
          )}
        </WidgetItem>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
}
