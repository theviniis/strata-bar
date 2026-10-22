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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import type { WidgetConfig } from '@/services/configuration/config'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { bridge } from '@/services/system/bridge'
import { optionLabel } from '@/features/audio/presentation'
import { useContext, createContext, useId } from 'react'
import { valueAt } from './monitor-layout'

const EditingContext = createContext<{
  values: WidgetConfig[]
  patch?: (path: string, value: unknown) => void
} | null>(null)
function useMixed(path: string) {
  const editing = useContext(EditingContext)
  const values = editing?.values ?? []
  return values.some(
    (value) =>
      JSON.stringify(valueAt(value, path)) !==
      JSON.stringify(valueAt(values[0], path))
  )
}

export function Choice({
  label,
  value,
  options,
  onChange
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange(value: string): void
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        items={options}
        value={value}
        onValueChange={(next) => {
          if (next !== null) onChange(next)
        }}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Valores diferentes" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
}

export function WidgetInspector({
  widget,
  onChange,
  values = [widget],
  onPatch
}: {
  widget: WidgetConfig
  onChange(next: WidgetConfig): void
  values?: WidgetConfig[]
  onPatch?(path: string, value: unknown): void
}) {
  const id = useId()
  const mixed = (path: string) =>
    values.some(
      (value) =>
        JSON.stringify(valueAt(value, path)) !==
        JSON.stringify(valueAt(values[0], path))
    )
  const update = (path: 'intervalMs' | 'format' | 'tooltip', value: unknown) =>
    onPatch ? onPatch(path, value) : onChange({ ...widget, [path]: value })
  return (
    <EditingContext.Provider value={{ values, patch: onPatch }}>
      <FieldSet>
        <FieldLegend>Configurar {widget.id}</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-interval`}>Intervalo (ms)</FieldLabel>
            <Input
              id={`${id}-interval`}
              type="number"
              min={1000}
              max={60000}
              step={1}
              placeholder={
                mixed('intervalMs') ? 'Valores diferentes' : undefined
              }
              aria-label={
                mixed('intervalMs')
                  ? 'Intervalo (ms) — Valores diferentes'
                  : undefined
              }
              value={
                mixed('intervalMs') || Number.isNaN(widget.intervalMs)
                  ? ''
                  : widget.intervalMs
              }
              onChange={(event) =>
                update('intervalMs', event.target.valueAsNumber)
              }
            />
            <FieldDescription>
              1000–60000 ms. Canais orientados a eventos mantêm sua própria
              cadência.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel>
              Formato{mixed('format') ? ' — Valores diferentes' : ''}
            </FieldLabel>
            <ToggleGroup
              variant="outline"
              value={mixed('format') ? [] : [widget.format]}
              onValueChange={([format]) => {
                if (format === 'compact' || format === 'label')
                  update('format', format)
              }}
            >
              <ToggleGroupItem value="compact">Compacto</ToggleGroupItem>
              <ToggleGroupItem value="label">Com rótulo</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-tooltip`}
              checked={mixed('tooltip') ? 'indeterminate' : widget.tooltip}
              onCheckedChange={(checked) => update('tooltip', checked === true)}
            />
            <FieldLabel htmlFor={`${id}-tooltip`}>Mostrar tooltip</FieldLabel>
          </Field>
          {(widget.type === 'volume' || widget.type === 'microphone') && (
            <AudioInspector widget={widget} onChange={onChange} />
          )}
        </FieldGroup>
      </FieldSet>
    </EditingContext.Provider>
  )
}

function AudioInspector({
  widget,
  onChange
}: {
  widget: WidgetConfig
  onChange(next: WidgetConfig): void
}) {
  // Only the native settings surface may subscribe; studio demo data is never a device list.
  return bridge.mode === 'native' ? (
    <NativeAudioInspector widget={widget} onChange={onChange} />
  ) : (
    <AudioFields widget={widget} onChange={onChange} />
  )
}

function NativeAudioInspector(props: {
  widget: WidgetConfig
  onChange(next: WidgetConfig): void
}) {
  const voice = useSystemChannel('voicemeeter')
  return (
    <AudioFields
      {...props}
      voice={voice.status === 'ready' ? voice.data : undefined}
    />
  )
}

function AudioFields({
  widget,
  onChange,
  voice
}: {
  widget: WidgetConfig
  onChange(next: WidgetConfig): void
  voice?: import('@/services/system/bridge').VoicemeeterData
}) {
  const id = useId()
  const editing = useContext(EditingContext)
  const sourceMixed = useMixed('audio.source')
  const labelMixed = useMixed('audio.label')
  const kindMixed = useMixed('audio.target.kind')
  const indexMixed = useMixed('audio.target.index')
  const enabledMixed = useMixed('audio.enabled')
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
  const update = (path: string, value: unknown) => {
    if (editing?.patch) editing.patch(`audio.${path}`, value)
    else if (path.startsWith('target.'))
      onChange({
        ...widget,
        audio: { ...audio, target: { ...target, [path.slice(7)]: value } }
      })
    else
      onChange({
        ...widget,
        audio: {
          ...audio,
          [path]: value,
          ...(path === 'source' && value === 'voicemeeter' ? { target } : {})
        }
      })
  }
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
