import {
  WidgetItem,
  WidgetItemIcon,
  type WidgetItemProps
} from '@/components/widget-item'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { Mic, MicOff } from 'lucide-react'
export interface MicrophoneProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['microphone']>
  describedBy: string | undefined
}
export function Microphone({
  event,
  describedBy,
  ...triggerProps
}: MicrophoneProps) {
  const muted = event.status === 'ready' && event.data.muted
  const Icon = muted ? MicOff : Mic
  return (
    <WidgetItem
      aria-label="Entrada de áudio"
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <WidgetItemIcon icon={Icon} />
    </WidgetItem>
  )
}
