import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Mic, MicOff } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { WidgetPopup } from '../../popups/WidgetPopup'

export function Microphone() {
  const value = useSystemChannel('microphone')
  const muted = value.status === 'ready' && value.data.muted
  const text =
    value.status === 'ready'
      ? `Microfone: ${value.data.level}%${muted ? ' (silenciado)' : ''}`
      : value.status === 'error'
        ? value.error
        : value.status === 'unavailable'
          ? 'Microfone indispon\u00edvel'
          : 'Carregando microfone'
  const tip = useOverlayTooltip(text)
  const Icon = muted ? MicOff : Mic

  return (
    <WidgetPopup.Root popup="audioInputs">
      <WidgetPopup.Anchor asChild>
        <div>
          <WidgetPopup.Trigger asChild>
            <WidgetItem aria-label="Entrada de áudio" {...tip.trigger}>
              <WidgetItemIcon icon={Icon} />
              <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
