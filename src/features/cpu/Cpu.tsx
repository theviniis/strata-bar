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
import { useCpu } from './useCpu'
import { isCpuMetricStale } from './presentation'

export function Cpu() {
  const { event, lastData, now } = useCpu()
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale = isCpuMetricStale(percent, now, event.status === 'ready')
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de CPU desatualizada ou indisponível'
        : 'Detalhes da CPU'
  const tip = useOverlayTooltip(text)
  return (
    <WidgetPopup.Root popup="cpu">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da CPU" {...tip.trigger}>
          <WidgetItemIcon icon={Icon} />
          <WidgetItemLabel>CPU</WidgetItemLabel>
          <WidgetItemOutput
            aria-label="Uso da CPU"
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
