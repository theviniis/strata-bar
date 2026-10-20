import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Volume2, VolumeX } from 'lucide-react'
import { useAudioSource } from '../../hooks/useAudioSource'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import {
  voicemeeterLabel,
  widgetAudio
} from '../../services/configuration/config'
import { useConfig } from '../../stores/config'
import { WidgetPopup } from '../../popups/WidgetPopup'

export function Volume() {
  const audio = useConfig((state) => widgetAudio(state.config, 'volume'))
  useAudioSource('volume', audio)
  const value = useSystemChannel('volume')
  const muted = value.status === 'ready' && value.data.muted
  const source =
    audio?.source === 'voicemeeter' && audio.enabled !== false
      ? `Voicemeeter: ${voicemeeterLabel(audio)}`
      : 'Volume do dispositivo padrão'
  const text =
    value.status === 'error'
      ? value.error
      : value.status === 'unavailable'
        ? `${source} indisponível`
        : source
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
