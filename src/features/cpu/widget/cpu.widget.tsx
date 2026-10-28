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
import { isCpuMetricStale } from '../src/presentation'

export interface CpuProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['cpu']>
  lastData: ChannelData['cpu'] | undefined
  now: number
  showUsage?: WidgetConfig['showUsage']
  showTemperature?: WidgetConfig['showTemperature']
  format: WidgetConfig['format']
  describedBy: string | undefined
}

export function Cpu({
  event,
  lastData,
  now,
  format,
  showUsage = true,
  showTemperature = false,
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
      {showUsage && (
        <WidgetItemOutput
          aria-label="Uso da CPU"
          aria-describedby={describedBy}
        >
          {percent?.value != null ? (
            <>
              {percent.value.toFixed(1)}
              {stale && <span aria-label="Leitura desatualizada">*</span>}%
            </>
          ) : event.status === 'loading' ? (
            '...'
          ) : (
            '—'
          )}
        </WidgetItemOutput>
      )}
      {showUsage && showTemperature && (
        <span
          aria-hidden="true"
          className="size-0.5 shrink-0 rounded-full bg-muted-foreground"
        />
      )}
      {showTemperature && (
        <WidgetItemOutput
          aria-label="Temperatura da CPU"
          aria-describedby={describedBy}
        >
          {data?.temperatureCelsius.value != null ? (
            <>
              {data.temperatureCelsius.value.toFixed(1)}
              {isCpuMetricStale(
                data.temperatureCelsius,
                now,
                event.status === 'ready'
              ) && <span aria-label="Leitura desatualizada">*</span>}{' '}
              °C
            </>
          ) : event.status === 'loading' ? (
            '...'
          ) : (
            '—'
          )}
        </WidgetItemOutput>
      )}
    </WidgetItem>
  )
}
