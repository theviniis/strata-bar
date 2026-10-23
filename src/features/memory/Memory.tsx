import { showLabel } from '@/components/status-bar/presentation'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import type { WidgetConfig } from '@/services/configuration/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { MemoryStick as Icon } from 'lucide-react'
import { isMemoryMetricStale } from './presentation'

export interface MemoryProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['memory']>
  lastData: ChannelData['memory'] | undefined
  now: number
  format: WidgetConfig['format']
  describedBy: string | undefined
}

export function Memory({
  event,
  lastData,
  now,
  format,
  describedBy,
  ...triggerProps
}: MemoryProps) {
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isMemoryMetricStale(percent, now, event.status === 'ready')
  return (
    <WidgetItem aria-label="Detalhes da memória" {...triggerProps}>
      <WidgetItemIcon icon={Icon} />
      {showLabel(format) && <WidgetItemLabel>RAM</WidgetItemLabel>}
      <WidgetItemOutput aria-label="Uso da RAM" aria-describedby={describedBy}>
        {percent?.value != null
          ? `${percent.value.toFixed(1)}%`
          : event.status === 'loading'
            ? '...'
            : '—'}
        {stale && percent?.value != null && (
          <span aria-label="Leitura desatualizada">*</span>
        )}
      </WidgetItemOutput>
    </WidgetItem>
  )
}
