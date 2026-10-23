import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import { CircuitBoard as Icon } from 'lucide-react'
import { showLabel } from '@/components/status-bar/presentation'
import type { WidgetConfig } from '@/services/configuration/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { isGpuMetricStale } from './presentation'

export interface GpuProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['gpu']>
  lastData: ChannelData['gpu'] | undefined
  now: number
  format: WidgetConfig['format']
  describedBy: string | undefined
}

export function Gpu({
  event,
  lastData,
  now,
  format,
  describedBy,
  ...triggerProps
}: GpuProps) {
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isGpuMetricStale(percent, now, event.status === 'ready')
  return (
    <WidgetItem aria-label="Detalhes da GPU" {...triggerProps}>
      <WidgetItemIcon icon={Icon} />
      {showLabel(format) && <WidgetItemLabel>GPU</WidgetItemLabel>}
      <WidgetItemOutput aria-label="Uso da GPU" aria-describedby={describedBy}>
        {percent?.value != null
          ? percent.value.toFixed(1)
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
