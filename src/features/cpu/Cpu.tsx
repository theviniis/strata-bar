import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { renderOutput } from '@/lib/utils'
import { Cpu as Icon } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'

export function Cpu() {
  const value = useSystemChannel('cpu')
  const text = value.status === 'error' ? value.error : 'Uso total de CPU'
  const tip = useOverlayTooltip(text)
  return (
    <WidgetItem {...tip.trigger}>
      <WidgetItemIcon icon={Icon} />
      <WidgetItemLabel>CPU</WidgetItemLabel>
      <WidgetItemOutput
        aria-label="Uso da CPU"
        aria-describedby={tip.describedBy}
      >
        {renderOutput(value)}
      </WidgetItemOutput>
      <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
    </WidgetItem>
  )
}
