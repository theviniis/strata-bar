import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { AudioSourceConfig } from '@/services/configuration/config'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { optionLabel } from '@/features/audio/src/presentation'
import { useId } from 'react'
import { Choice } from './widget-inspector'

export function AudioInspectorFields({
  channel,
  audio,
  onChange
}: {
  channel: 'output' | 'input'
  audio: AudioSourceConfig
  onChange(audio: AudioSourceConfig): void
}) {
  const event = useSystemChannel('voicemeeter')
  const voice = event.status === 'ready' ? event.data : undefined
  const items = (channel === 'output' ? voice?.buses : voice?.strips) ?? []
  const id = useId()
  return (
    <FieldGroup>
      <Choice
        label="Fonte de áudio"
        value={audio.source}
        options={[
          { value: 'windows', label: 'Windows' },
          { value: 'voicemeeter', label: 'Voicemeeter' }
        ]}
        onChange={(source) => {
          if (source === 'windows' || source === 'voicemeeter')
            onChange({ ...audio, source })
        }}
      />
      {audio.source === 'voicemeeter' &&
        (items.length > 0 ? (
          <Choice
            label="Alvo Voicemeeter"
            value={String(audio.targetIndex)}
            options={[
              ...(!items.some((item) => item.index === audio.targetIndex)
                ? [
                    {
                      value: String(audio.targetIndex),
                      label: `Alvo salvo (${audio.targetIndex}) indisponível`
                    }
                  ]
                : []),
              ...items.map((item) => ({
                value: String(item.index),
                label: optionLabel(item)
              }))
            ]}
            onChange={(index) =>
              onChange({ ...audio, targetIndex: Number(index) })
            }
          />
        ) : (
          <Field>
            <FieldLabel htmlFor={id}>Índice do alvo</FieldLabel>
            <Input
              id={id}
              className="max-w-24"
              type="number"
              min={0}
              max={7}
              step={1}
              value={Number.isNaN(audio.targetIndex) ? '' : audio.targetIndex}
              onChange={(event) =>
                onChange({ ...audio, targetIndex: event.target.valueAsNumber })
              }
            />
            <FieldDescription>
              Lista ao vivo indisponível. Informe um índice de 0 a 7.
            </FieldDescription>
          </Field>
        ))}
    </FieldGroup>
  )
}
