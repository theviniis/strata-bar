import { useId, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import { WidgetInspector } from './WidgetInspector'

export function MonitorWidgetInspector({
  widget,
  draft,
  onChange
}: {
  widget: WidgetConfig
  draft: Config
  onChange(next: Config): void
}) {
  const [monitor, setMonitor] = useState('')
  const id = useId()
  const key = monitor
    .trim()
    .replace(/^\\\\\.\\/, '')
    .toUpperCase()
  const storedKey =
    Object.keys(draft.monitors).find(
      (name) => name.replace(/^\\\\\.\\/, '').toUpperCase() === key
    ) ?? key
  const override = draft.monitors[storedKey]?.widgets?.[widget.id]
  const effective = { ...widget, ...override }

  function replace(nextWidget: WidgetConfig) {
    const next = structuredClone(draft)
    if (!key) {
      for (const section of Object.values(next.widgets)) {
        const index = section.findIndex((item) => item.id === widget.id)
        if (index >= 0) section[index] = nextWidget
      }
    } else {
      const { enabled, intervalMs, format, tooltip, audio } = nextWidget
      const entry = next.monitors[storedKey] ?? {}
      next.monitors[storedKey] = {
        ...entry,
        widgets: {
          ...entry.widgets,
          [widget.id]: { enabled, intervalMs, format, tooltip, audio }
        }
      }
    }
    onChange(next)
  }

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${id}-monitor`}>Monitor</FieldLabel>
        <Input
          id={`${id}-monitor`}
          list={`${id}-monitors`}
          placeholder="Global (todos os monitores)"
          value={monitor}
          onChange={(event) => setMonitor(event.target.value)}
        />
        <datalist id={`${id}-monitors`}>
          {Object.keys(draft.monitors).map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        <FieldDescription>
          Deixe vazio para editar o padrão global, ou informe o nome do Windows
          (por exemplo, DISPLAY2).
        </FieldDescription>
      </Field>
      {key && (
        <Field orientation="horizontal">
          <Checkbox
            id={`${id}-custom`}
            checked={!!override}
            onCheckedChange={(checked) => {
              if (checked) replace(widget)
              else {
                const next = structuredClone(draft)
                delete next.monitors[storedKey]?.widgets?.[widget.id]
                onChange(next)
              }
            }}
          />
          <FieldLabel htmlFor={`${id}-custom`}>
            Personalizar neste monitor
          </FieldLabel>
        </Field>
      )}
      <fieldset disabled={!!key && !override}>
        {key && (
          <Field orientation="horizontal">
            <Checkbox
              id={`${id}-enabled`}
              checked={effective.enabled}
              onCheckedChange={(checked) =>
                replace({ ...effective, enabled: checked === true })
              }
            />
            <FieldLabel htmlFor={`${id}-enabled`}>
              Ativo neste monitor
            </FieldLabel>
          </Field>
        )}
        <WidgetInspector widget={effective} onChange={replace} />
      </fieldset>
    </FieldGroup>
  )
}
