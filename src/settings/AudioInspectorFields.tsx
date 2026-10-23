import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { WidgetConfig } from '@/services/configuration/config'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { optionLabel } from '@/features/audio/presentation'
import { useId } from 'react'
import { valueAt } from './monitor-layout'
import { Choice } from './WidgetInspector'
export function AudioInspectorFields({
  widget,
  values,
  onPatch
}: {
  widget: WidgetConfig
  values: WidgetConfig[]
  onPatch(path: string, value: unknown): void
}) {
  const channel = useSystemChannel('voicemeeter')
  const voice = channel.status === 'ready' ? channel.data : undefined
  const mixed = (path: string) =>
    values.some(
      (value) =>
        JSON.stringify(valueAt(value, path)) !==
        JSON.stringify(valueAt(values[0], path))
    )
  const id = useId()
  const sourceMixed = mixed('audio.source')
  const labelMixed = mixed('audio.label')
  const kindMixed = mixed('audio.target.kind')
  const indexMixed = mixed('audio.target.index')
  const enabledMixed = mixed('audio.enabled')
  const audio = widget.audio ?? { source: 'windows' as const }
  const target = audio.target ?? {
    kind: widget.type === 'volume' ? ('bus' as const) : ('strip' as const),
    index: 0
  }
  const items = voice
    ? target.kind === 'bus'
      ? voice.buses
      : voice.strips
    : []
  const update = (path: string, value: unknown) =>
    onPatch(`audio.${path}`, value)
  return (
    <FieldSet>
      <FieldLegend>Áudio</FieldLegend>
      <FieldGroup>
        <Choice
          label="Fonte de áudio"
          value={sourceMixed ? '' : audio.source}
          options={[
            { value: 'windows', label: 'Windows' },
            { value: 'voicemeeter', label: 'Voicemeeter' }
          ]}
          onChange={(source) => {
            if (source === 'windows' || source === 'voicemeeter')
              update('source', source)
          }}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-label`}>Rótulo de áudio</FieldLabel>
          <Input
            id={`${id}-label`}
            placeholder={labelMixed ? 'Valores diferentes' : undefined}
            value={labelMixed ? '' : (audio.label ?? '')}
            onChange={(event) =>
              update('label', event.target.value || undefined)
            }
          />
        </Field>
        {(audio.source === 'voicemeeter' || sourceMixed) && (
          <>
            <Choice
              label="Tipo de alvo"
              value={kindMixed ? '' : target.kind}
              options={[
                { value: 'strip', label: 'Strip' },
                { value: 'bus', label: 'Bus' }
              ]}
              onChange={(kind) => {
                if (kind === 'strip' || kind === 'bus')
                  update('target.kind', kind)
              }}
            />
            {voice && items.length > 0 ? (
              <Choice
                label="Alvo Voicemeeter"
                value={indexMixed ? '' : String(target.index)}
                options={[
                  ...(!items.some((item) => item.index === target.index)
                    ? [
                        {
                          value: String(target.index),
                          label: `Alvo salvo (${target.index}) indisponível`
                        }
                      ]
                    : []),
                  ...items.map((item) => ({
                    value: String(item.index),
                    label: optionLabel(item)
                  }))
                ]}
                onChange={(index) => update('target.index', Number(index))}
              />
            ) : (
              <Field>
                <FieldLabel htmlFor={`${id}-index`}>Índice do alvo</FieldLabel>
                <Input
                  id={`${id}-index`}
                  type="number"
                  min={0}
                  max={7}
                  step={1}
                  placeholder={indexMixed ? 'Valores diferentes' : undefined}
                  value={
                    indexMixed || Number.isNaN(target.index) ? '' : target.index
                  }
                  onChange={(event) =>
                    update('target.index', event.target.valueAsNumber)
                  }
                />
                <FieldDescription>
                  Lista ao vivo indisponível. Informe um índice de 0 a 7; nenhum
                  dispositivo demonstrativo é usado.
                </FieldDescription>
              </Field>
            )}
            <Field orientation="horizontal">
              <Checkbox
                id={`${id}-windows`}
                checked={
                  enabledMixed ? 'indeterminate' : audio.enabled === false
                }
                onCheckedChange={(checked) =>
                  update('enabled', checked !== true)
                }
              />
              <FieldLabel htmlFor={`${id}-windows`}>
                Usar endpoints do Windows mantendo o alvo
              </FieldLabel>
            </Field>
          </>
        )}
        <FieldDescription>
          Os dispositivos nos popups continuam alternando endpoints do Windows.
          O roteamento de cada canal é compartilhado entre barras: a última
          alteração prevalece.
        </FieldDescription>
      </FieldGroup>
    </FieldSet>
  )
}
