import type { Config, WidgetConfig } from '@/services/configuration/config'
import { CalendarSettingsController } from '@/features/reminders/src/calendar-settings-controller'
import { SpotifySettingsController } from '@/features/music/src/spotify-settings-controller'
import { WeatherSettings } from '@/features/weather/src/weather-settings'
import { AgentsSettings } from './agents-settings'
import { AudioInspectorFields } from './audio-inspector-fields'
import { SettingsSection } from './settings-layout'

/** Integration controls live beside the widget that uses them. */
export function WidgetSettings({
  widget,
  draft,
  onChange
}: {
  widget: WidgetConfig
  draft: Config
  onChange(next: Config): void
}) {
  switch (widget.type) {
    case 'reminders':
      return (
        <SettingsSection
          title="Google Calendar"
          description="Conectar e desconectar têm efeito imediato e global. Reverter não desfaz essas ações."
        >
          <CalendarSettingsController />
        </SettingsSection>
      )
    case 'music':
      return (
        <SettingsSection
          title="Conexão Spotify"
          description="Conectar e desconectar têm efeito imediato e global. Reverter não desfaz essas ações."
        >
          <SpotifySettingsController />
        </SettingsSection>
      )
    case 'agents':
      return <AgentsSettings draft={draft} onChange={onChange} />
    case 'weather':
      return (
        <SettingsSection
          title="Localização e unidades"
          description="A cidade e as unidades são compartilhadas por todas as barras."
        >
          <WeatherSettings
            value={draft.weather}
            onChange={(weather) => onChange({ ...draft, weather })}
          />
        </SettingsSection>
      )
    case 'volume':
    case 'microphone': {
      const channel = widget.type === 'volume' ? 'output' : 'input'
      return (
        <SettingsSection
          title={channel === 'output' ? 'Saída de áudio' : 'Entrada de áudio'}
          description="A fonte de áudio é compartilhada por todas as barras. As alterações entram em vigor após Aplicar."
        >
          <AudioInspectorFields
            channel={channel}
            audio={draft.audio[channel]}
            onChange={(audio) =>
              onChange({
                ...draft,
                audio: { ...draft.audio, [channel]: audio }
              })
            }
          />
        </SettingsSection>
      )
    }
    default:
      return null
  }
}
