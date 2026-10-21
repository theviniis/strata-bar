import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Cpu as Icon } from 'lucide-react'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { showLabel } from '@/components/status-bar/presentation'
import { isCpuMetricStale } from './presentation'

export function Cpu() {
  const view = useWidgetView()
  const { event, lastData, now } = useResourceChannel('cpu', view.intervalMs)
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isCpuMetricStale(percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de CPU desatualizada ou indisponível'
        : 'Detalhes da CPU'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="cpu">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da CPU" {...tip.trigger}>
          <WidgetItemIcon icon={Icon} />
          {showLabel(view.format) && <WidgetItemLabel>CPU</WidgetItemLabel>}
          <WidgetItemOutput
            aria-label="Uso da CPU"
            aria-describedby={view.tooltip ? tip.describedBy : undefined}
          >
            {percent?.value != null
              ? percent.value.toFixed(1)
              : event.status === 'loading'
                ? '...'
                : '—'}
            {stale && percent?.value != null && (
              <span aria-label="Leitura desatualizada">*</span>
            )}
          </WidgetItemOutput>
          {view.tooltip && (
            <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
          )}
        </WidgetItem>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
}
