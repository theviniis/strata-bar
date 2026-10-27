import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldTitle
} from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { Config } from '@/services/configuration/config'
import { colorThemeSchema } from '@/services/configuration/config'
import { colorThemes } from '@/services/theme/palettes'
import { Check } from 'lucide-react'
import { useId } from 'react'
import type { ConfigDraft } from './draft'
import { SettingsSection } from './settings-layout'
import { ThemePreview } from './theme-preview'

interface BarSettingsProps {
  disabled?: boolean
  draft: Config
  onChange(next: ConfigDraft): void
}

/** Presentation and native AppBar settings, applied together through config_save. */
export function BarSettings({ draft, onChange, disabled }: BarSettingsProps) {
  const paletteId = useId()
  const themeId = useId()
  const spacingId = useId()
  const heightId = useId()
  const positionId = useId()
  return (
    <FieldGroup className="@container">
      <SettingsSection title="Temas" wide>
        <FieldGroup>
          <Field data-disabled={disabled}>
            <FieldTitle id={themeId}>Modo de aparência</FieldTitle>
            <ToggleGroup
              className="grid w-full grid-cols-3 items-stretch"
              disabled={disabled}
              aria-labelledby={themeId}
              variant="outline"
              value={[draft.bar.theme]}
              onValueChange={(values) => {
                const theme = values[0]
                if (
                  theme === 'system' ||
                  theme === 'dark' ||
                  theme === 'light'
                ) {
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
                  className="h-auto min-w-0 flex-col gap-3 p-3"
                >
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
          </Field>
          <Field data-disabled={disabled}>
            <FieldTitle id={paletteId}>Paleta de cores</FieldTitle>
            <ToggleGroup
              className="grid w-full grid-cols-1 items-stretch @min-[32rem]:grid-cols-2"
              disabled={disabled}
              aria-labelledby={paletteId}
              variant="outline"
              value={[draft.bar.colorTheme]}
              onValueChange={(values) => {
                const result = colorThemeSchema.safeParse(values[0])
                if (result.success)
                  onChange({
                    ...draft,
                    bar: { ...draft.bar, colorTheme: result.data }
                  })
              }}
            >
              {colorThemeSchema.options.map((colorTheme) => (
                <ToggleGroupItem
                  key={colorTheme}
                  value={colorTheme}
                  aria-label={colorThemes[colorTheme].label}
                  render={<div />}
                  nativeButton={false}
                  className="h-auto min-w-0 flex-col gap-3 p-3 hover:text-foreground"
                >
                  <span className="flex w-full items-center justify-between gap-2">
                    {colorThemes[colorTheme].label}
                    <Check
                      aria-hidden="true"
                      className={cn(
                        draft.bar.colorTheme !== colorTheme && 'invisible'
                      )}
                    />
                  </span>
                  <ThemePreview
                    config={{ ...draft, bar: { ...draft.bar, colorTheme } }}
                  />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </SettingsSection>
      <SettingsSection title="Dimensões e espaçamento">
        <FieldGroup>
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
        </FieldGroup>
      </SettingsSection>
      <SettingsSection title="Posicionamento e comportamento">
        <FieldGroup>
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
          </Field>
        </FieldGroup>
      </SettingsSection>
    </FieldGroup>
  )
}
