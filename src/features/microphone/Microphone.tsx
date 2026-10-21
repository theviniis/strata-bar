import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { Mic, MicOff } from 'lucide-react'
import { useAudioSource } from '../../hooks/useAudioSource'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { useWidgetView } from '@/components/status-bar/widget-view'
import {
  voicemeeterLabel,
  widgetAudio
} from '../../services/configuration/config'
import { useConfig } from '../../stores/config'
import { WidgetPopup } from '../../popups/WidgetPopup'

export function Microphone() {
  const view = useWidgetView()
  const audio = useConfig((state) => widgetAudio(state.config, 'microphone'))
  useAudioSource('microphone', audio)
  const value = useSystemChannel('microphone', 0, view.intervalMs)
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
  const tip = useOverlayTooltip(view.tooltip ? text : '')
  const Icon = muted ? MicOff : Mic

  return (
    <WidgetPopup.Root popup="audioInputs">
      <WidgetPopup.Anchor asChild>
        <div>
          <WidgetPopup.Trigger asChild>
            <WidgetItem aria-label="Entrada de áudio" {...tip.trigger}>
              <WidgetItemIcon icon={Icon} />
              {view.tooltip && (
                <WidgetItemTooltip id={tip.describedBy}>
                  {text}
                </WidgetItemTooltip>
              )}
            </WidgetItem>
          </WidgetPopup.Trigger>
        </div>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}
