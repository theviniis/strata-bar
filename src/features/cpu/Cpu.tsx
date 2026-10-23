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
import { Cpu as Icon } from 'lucide-react'
import { isCpuMetricStale } from './presentation'

export interface CpuProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['cpu']>
  lastData: ChannelData['cpu'] | undefined
  now: number
  format: WidgetConfig['format']
  describedBy: string | undefined
}

export function Cpu({
  event,
  lastData,
  now,
  format,
  describedBy,
  ...triggerProps
}: CpuProps) {
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isCpuMetricStale(percent, now, event.status === 'ready')
  return (
    <WidgetItem aria-label="Detalhes da CPU" {...triggerProps}>
      <WidgetItemIcon icon={Icon} />
      {showLabel(format) && <WidgetItemLabel>CPU</WidgetItemLabel>}
      <WidgetItemOutput aria-label="Uso da CPU" aria-describedby={describedBy}>
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
