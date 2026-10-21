import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { CircuitBoard } from 'lucide-react'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { showLabel } from '@/components/status-bar/presentation'
import { isGpuMetricStale } from './presentation'

export function Gpu() {
  const view = useWidgetView()
  const { event, lastData, now } = useResourceChannel('gpu', view.intervalMs)
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isGpuMetricStale(percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de GPU desatualizada ou indisponível'
        : 'Detalhes da GPU'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  return (
    <WidgetPopup.Root popup="gpu">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da GPU" {...tip.trigger}>
          <WidgetItemIcon icon={CircuitBoard} />
          {showLabel(view.format) && <WidgetItemLabel>GPU</WidgetItemLabel>}
          <WidgetItemOutput
            aria-label="Uso da GPU"
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
