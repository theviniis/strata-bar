import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Volume2, VolumeX } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { WidgetPopup } from '../../popups/WidgetPopup'

export function Volume() {
  const value = useSystemChannel('volume')
  const muted = value.status === 'ready' && value.data.muted
  const text =
    (value.status === 'error' ? value.error : '') ||
    'Volume do dispositivo padrão'
  const tip = useOverlayTooltip(text)
  const Icon = muted ? VolumeX : Volume2

  return (
    <WidgetPopup.Root popup="audioOutputs">
      <WidgetPopup.Anchor asChild>
        <div>
          <WidgetPopup.Trigger asChild>
            <WidgetItem aria-label="Saída de áudio" {...tip.trigger}>
              <WidgetItemIcon icon={Icon} />
              <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
