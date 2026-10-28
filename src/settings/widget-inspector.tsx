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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { WidgetConfig } from '@/services/configuration/config'
import { useId } from 'react'
import type { WidgetEdit } from './monitor-layout'

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
  separatorMarginX = 0,
  onSeparatorMarginChange
}: {
  widget: WidgetConfig
  onChange(patch: WidgetEdit): void
  separatorMarginX?: number
  onSeparatorMarginChange?(value: number): void
}) {
  const id = useId()
  if (widget.type === 'separator') {
    return (
      <FieldSet>
        <FieldLegend>Configurar {widget.id}</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-margin`}>
              Margem horizontal (px)
            </FieldLabel>
            <Input
              id={`${id}-margin`}
              type="number"
              min={0}
              max={32}
              step="any"
              value={Number.isNaN(separatorMarginX) ? '' : separatorMarginX}
              onChange={(event) =>
                onSeparatorMarginChange?.(event.target.valueAsNumber)
              }
            />
            <FieldDescription>
              Todos os separadores, em todos os monitores, usam esta margem. 0 a
              32 px de cada lado, somados ao espaçamento da barra.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
    )
  }
  return (
    <>
      <FieldSet>
        <FieldLegend>Configurar {widget.id}</FieldLegend>
        <FieldGroup>
          {widget.type === 'network' && (
            <Field>
              <FieldLabel>Tráfego exibido</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[widget.networkDirection ?? 'both']}
                onValueChange={([networkDirection]) => {
                  if (
                    networkDirection === 'both' ||
                    networkDirection === 'download' ||
                    networkDirection === 'upload'
                  )
                    onChange({ networkDirection })
                }}
              >
                <ToggleGroupItem value="download">Download</ToggleGroupItem>
                <ToggleGroupItem value="upload">Upload</ToggleGroupItem>
                <ToggleGroupItem value="both">Ambos</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
          {widget.type === 'workspaces' && (
            <Field>
              <FieldLabel>Monitorar</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[widget.workspaceSource ?? 'windows']}
                onValueChange={([source]) => {
                  if (source === 'komorebi' || source === 'windows')
                    onChange({ workspaceSource: source })
                }}
              >
                <ToggleGroupItem value="windows">
                  Áreas de trabalho do Windows
                </ToggleGroupItem>
                <ToggleGroupItem value="komorebi">Komorebi</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor={`${id}-interval`}>Intervalo (ms)</FieldLabel>
            <Input
              id={`${id}-interval`}
              type="number"
              min={1000}
              max={60000}
              step={1}
              value={Number.isNaN(widget.intervalMs) ? '' : widget.intervalMs}
              onChange={(event) =>
                onChange({ intervalMs: event.target.valueAsNumber })
              }
            />
            <FieldDescription>
              1000–60000 ms. Canais orientados a eventos mantêm sua própria
              cadência.
            </FieldDescription>
          </Field>
          {[
            'clock',
            'weather',
            'reminders',
            'cpu',
            'memory',
            'gpu',
            'disk',
            'network',
            'workspaces'
          ].includes(widget.type) && (
            <Field>
              <FieldLabel>Formato</FieldLabel>
              <ToggleGroup
                variant="outline"
                value={[widget.format]}
                onValueChange={([format]) => {
                  if (format === 'compact' || format === 'label')
                    onChange({ format })
                }}
              >
                <ToggleGroupItem value="compact">Compacto</ToggleGroupItem>
                <ToggleGroupItem value="label">Com rótulo</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-tooltip`}
              checked={widget.tooltip}
              onCheckedChange={(checked) =>
                onChange({ tooltip: checked === true })
              }
            />
            <FieldLabel htmlFor={`${id}-tooltip`}>Mostrar tooltip</FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>
    </>
  )
}
