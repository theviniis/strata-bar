import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { MemoryStick } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import { useResourceChannel } from '@/hooks/useResourceChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { showLabel } from '@/components/status-bar/presentation'
import { isMemoryMetricStale } from './presentation'

export function Memory() {
  const view = useWidgetView()
  const { event, lastData, now } = useResourceChannel('memory', view.intervalMs)
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isMemoryMetricStale(percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de RAM desatualizada ou indisponível'
        : 'Detalhes da memória'
  const tip = useOverlayTooltip(view.tooltip ? text : '')

  return (
    <WidgetPopup.Root popup="memory">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da memória" {...tip.trigger}>
          <WidgetItemIcon icon={MemoryStick} />
          {showLabel(view.format) && <WidgetItemLabel>RAM</WidgetItemLabel>}
          <WidgetItemOutput
            aria-label="Uso da RAM"
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
