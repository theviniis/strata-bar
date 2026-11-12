import {
  WidgetItem,
  WidgetItemIcon,
  type WidgetItemProps
} from '@/components/widget-item'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { Cable } from 'lucide-react'

export interface VoicemeeterMidiStatusProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['voicemeeterMidi']>
  describedBy: string | undefined
}

function getStatusColor(
  status: SystemEvent<ChannelData['voicemeeterMidi']>['status'],
  data?: ChannelData['voicemeeterMidi'] | null
) {
  if (status === 'ready' && data && data.status === 'connected')
    return 'text-green-500'
  if (status === 'ready' && data && data.status === 'disconnected')
    return 'text-red-500'
  if (status === 'ready' && data && data.status === 'checking')
    return 'text-yellow-500'
  if (status === 'unavailable') return 'text-gray-500'
  if (status === 'error') return 'text-red-500'
  return 'text-gray-500'
}

export function VoicemeeterMidiStatus({
  event,
  describedBy,
  ...triggerProps
}: VoicemeeterMidiStatusProps) {
  const Icon = Cable
  const statusColor = getStatusColor(
    event.status,
    event.status === 'ready' ? event.data : null
  )

  return (
    <WidgetItem
      aria-label="Status MIDI do Voicemeeter"
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <WidgetItemIcon icon={Icon} className={statusColor} />
    </WidgetItem>
  )
}
