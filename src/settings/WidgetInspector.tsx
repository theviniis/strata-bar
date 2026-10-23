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
import { useId } from 'react'
import { valueAt } from './monitor-layout'

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
    <>
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
        </FieldGroup>
      </FieldSet>
    </>
  )
}
