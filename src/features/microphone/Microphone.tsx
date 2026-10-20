import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Mic, MicOff } from 'lucide-react'
import { useAudioSource } from '../../hooks/useAudioSource'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import {
  voicemeeterLabel,
  widgetAudio
} from '../../services/configuration/config'
import { useConfig } from '../../stores/config'
import { WidgetPopup } from '../../popups/WidgetPopup'

export function Microphone() {
  const audio = useConfig((state) => widgetAudio(state.config, 'microphone'))
  useAudioSource('microphone', audio)
  const value = useSystemChannel('microphone')
  const muted = value.status === 'ready' && value.data.muted
  const source =
    audio?.source === 'voicemeeter' && audio.enabled !== false
      ? `Microfone (${voicemeeterLabel(audio)})`
      : 'Microfone'
  const text =
    value.status === 'ready'
      ? `${source}: ${value.data.level}%${muted ? ' (silenciado)' : ''}`
      : value.status === 'error'
        ? value.error
        : value.status === 'unavailable'
          ? `${source} indisponível`
          : `Carregando ${source.toLowerCase()}`
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
