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
import { Monitor as Icon } from 'lucide-react'
import { isGpuMetricStale } from '../src/presentation'

export interface GpuProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['gpu']>
  lastData: ChannelData['gpu'] | undefined
  now: number
  showUsage?: WidgetConfig['showUsage']
  showTemperature?: WidgetConfig['showTemperature']
  format: WidgetConfig['format']
  describedBy: string | undefined
}

export function Gpu({
  event,
  lastData,
  now,
  format,
  showUsage = true,
  showTemperature = false,
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
      {showUsage && (
        <WidgetItemOutput
          aria-label="Uso da GPU"
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
          aria-label="Temperatura da GPU"
          aria-describedby={describedBy}
        >
          {data?.temperatureCelsius.value != null ? (
            <>
              {data.temperatureCelsius.value.toFixed(1)}
              {isGpuMetricStale(
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
