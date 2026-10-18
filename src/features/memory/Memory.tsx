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
import { useMemory } from './useMemory'

export function Memory() {
  const { event, lastData, now } = useMemory()
  const data = event.status === 'ready' ? event.data : lastData
  const percent = data?.percent
  const stale =
    event.status !== 'ready' ||
    percent?.status !== 'ready' ||
    now - (percent.updatedAt ?? 0) > 6000
  const text =
    event.status === 'error'
      ? event.error
      : stale
        ? 'Leitura de RAM desatualizada ou indisponível'
        : 'Detalhes da memória'
  const tip = useOverlayTooltip(text)

  return (
    <WidgetPopup.Root popup="memory">
      <WidgetPopup.Trigger asChild>
        <WidgetItem aria-label="Detalhes da memória" {...tip.trigger}>
          <WidgetItemIcon icon={MemoryStick} />
          <WidgetItemLabel>RAM</WidgetItemLabel>
          <WidgetItemOutput
            aria-label="Uso da RAM"
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
