import { Bot } from 'lucide-react'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'

export function Agents() {
  const tip = useOverlayTooltip('Agentes de IA')
  return (
    <WidgetPopup.Root popup="agents">
      <WidgetPopup.Trigger asChild>
        <WidgetItem
          type="button"
          aria-label="Abrir agentes de IA"
          aria-describedby={tip.describedBy}
          {...tip.trigger}
        >
          <WidgetItemIcon icon={Bot} aria-hidden="true" />
          <WidgetItemTooltip id={tip.describedBy}>
            Agentes de IA
          </WidgetItemTooltip>
        </WidgetItem>
      </WidgetPopup.Trigger>
    </WidgetPopup.Root>
  )
}
