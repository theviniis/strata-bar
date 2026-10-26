import { SettingsSection } from './SettingsLayout'
import type { Config } from '@/services/configuration/config'
import { AudioInspectorFields } from './AudioInspectorFields'

export function AudioSettings({
  draft,
  onChange
}: {
  draft: Config
  onChange(next: Config): void
}) {
  return (
    <div className="flex flex-col gap-6">
      {(['output', 'input'] as const).map((channel) => (
        <section
          key={channel}
          id={`audio-${channel}`}
          aria-label={
            channel === 'output' ? 'Saída de áudio' : 'Entrada de áudio'
          }
        >
          <SettingsSection
            title={channel === 'output' ? 'Saída de áudio' : 'Entrada de áudio'}
            description="Estas configurações se aplicam a todas as barras. As alterações entram em vigor após Aplicar."
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
        </section>
      ))}
    </div>
  )
}
