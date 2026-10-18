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
import { isGpuMetricStale } from './presentation'

export function Gpu() {
  const { event, lastData, now } = useResourceChannel('gpu')
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isGpuMetricStale(percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de GPU desatualizada ou indisponível'
        : 'Detalhes da GPU'
  const tip = useOverlayTooltip(text)
  return (
    <WidgetPopup.Root popup="gpu">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da GPU" {...tip.trigger}>
          <WidgetItemIcon icon={CircuitBoard} />
          <WidgetItemLabel>GPU</WidgetItemLabel>
          <WidgetItemOutput
            aria-label="Uso da GPU"
            aria-describedby={tip.describedBy}
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
          <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
        </WidgetItem>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
}
