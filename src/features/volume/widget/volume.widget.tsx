import {
  WidgetItem,
  WidgetItemIcon,
  type WidgetItemProps
} from '@/components/widget-item'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { Volume2, VolumeX } from 'lucide-react'
export interface VolumeProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['volume']>
  describedBy: string | undefined
}
export function Volume({ event, describedBy, ...triggerProps }: VolumeProps) {
  const muted = event.status === 'ready' && event.data.muted
  const Icon = muted ? VolumeX : Volume2
  return (
    <WidgetItem
      aria-label="Saída de áudio"
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <WidgetItemIcon icon={Icon} />
    </WidgetItem>
  )
}
