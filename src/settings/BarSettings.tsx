import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { Config } from '@/services/configuration/config'
import { Check } from 'lucide-react'
import { useId } from 'react'
import type { ConfigDraft } from './draft'
import { ThemePreview } from './ThemePreview'

interface BarSettingsProps {
  disabled?: boolean
  draft: Config
  onChange(next: ConfigDraft): void
}

/** Presentation and native AppBar settings, applied together through config_save. */
export function BarSettings({ draft, onChange, disabled }: BarSettingsProps) {
  const themeId = useId()
  const spacingId = useId()
  const heightId = useId()
  const positionId = useId()
  const topmostId = useId()
  return (
    <FieldGroup>
      <Field data-disabled={disabled}>
        <FieldTitle id={themeId}>Tema</FieldTitle>
        <ToggleGroup
          className="grid w-full grid-cols-1 items-stretch"
          disabled={disabled}
          aria-labelledby={themeId}
          variant="outline"
          value={[draft.bar.theme]}
          onValueChange={(values) => {
            const theme = values[0]
            if (theme === 'system' || theme === 'dark' || theme === 'light') {
              onChange({ ...draft, bar: { ...draft.bar, theme } })
            }
          }}
        >
          {(
            [
              { theme: 'system', label: 'Sistema' },
              { theme: 'dark', label: 'Escuro' },
              { theme: 'light', label: 'Claro' }
            ] as const
          ).map(({ theme, label }) => (
            <ToggleGroupItem
              key={theme}
              value={theme}
              aria-label={label}
              render={<div />}
              nativeButton={false}
              className="h-auto min-w-0 flex-col gap-3 p-3"
            >
              <ThemePreview
                config={{ ...draft, bar: { ...draft.bar, theme } }}
              />
              <span className="flex w-full items-center justify-between gap-2">
                {label}
                <Check
                  aria-hidden="true"
                  className={cn(draft.bar.theme !== theme && 'invisible')}
                />
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FieldDescription>
          Prévia da barra com o layout do rascunho e dados demonstrativos, como
          no studio.
        </FieldDescription>
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={spacingId}>
          Espaçamento entre widgets ({draft.bar.spacing}px)
        </FieldLabel>
        <Slider
          disabled={disabled}
          id={spacingId}
          aria-label="Espaçamento entre widgets"
          min={0}
          max={32}
          step={1}
          value={[draft.bar.spacing]}
          onValueChange={([spacing]) =>
            onChange({ ...draft, bar: { ...draft.bar, spacing } })
          }
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldLabel htmlFor={heightId}>
          Altura da barra ({draft.bar.height}px)
        </FieldLabel>
        <Slider
          disabled={disabled}
          id={heightId}
          aria-label="Altura da barra"
          min={28}
          max={80}
          step={1}
          value={[draft.bar.height]}
          onValueChange={([height]) =>
            onChange({ ...draft, bar: { ...draft.bar, height } })
          }
        />
      </Field>
      <Field data-disabled={disabled}>
        <FieldTitle id={positionId}>Posição da barra</FieldTitle>
        <ToggleGroup
          disabled={disabled}
          aria-labelledby={positionId}
          variant="outline"
          value={[draft.bar.position]}
          onValueChange={(values) => {
            const position = values[0]
            if (position === 'top' || position === 'bottom') {
              onChange({ ...draft, bar: { ...draft.bar, position } })
            }
          }}
        >
          <ToggleGroupItem value="top">Superior</ToggleGroupItem>
          <ToggleGroupItem value="bottom">Inferior</ToggleGroupItem>
        </ToggleGroup>
        <FieldDescription>
          Ao aplicar, o Windows atualiza a área reservada para a barra.{' '}
          <a
            href="https://github.com/theviniis/strata-bar/issues/3"
            target="_blank"
            rel="noreferrer"
          >
            Detalhes da geometria
          </a>
        </FieldDescription>
      </Field>
      <Field orientation="horizontal" data-disabled={disabled}>
        <Checkbox
          id={topmostId}
          disabled={disabled}
          checked={draft.bar.alwaysOnTop}
          onCheckedChange={(checked) =>
            onChange({
              ...draft,
              bar: { ...draft.bar, alwaysOnTop: checked === true }
            })
          }
        />
        <FieldLabel htmlFor={topmostId}>Sempre no topo</FieldLabel>
      </Field>
    </FieldGroup>
  )
}
