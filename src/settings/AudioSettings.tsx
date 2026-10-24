import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
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
          aria-labelledby={`audio-${channel}-title`}
        >
          <Card>
            <CardHeader>
              <CardTitle
                id={`audio-${channel}-title`}
                role="heading"
                aria-level={2}
              >
                {channel === 'output' ? 'Saída de áudio' : 'Entrada de áudio'}
              </CardTitle>
              <CardDescription>
                Estas configurações se aplicam a todas as barras. As alterações
                entram em vigor após Aplicar.
              </CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}
