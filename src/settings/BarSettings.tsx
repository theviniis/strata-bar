import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle
} from '@/components/ui/field'
import { Slider } from '@/components/ui/slider'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { Config } from '@/services/configuration/config'
import type { AgentType } from '@/services/system/agents.generated'
import { Check } from 'lucide-react'
import { useId } from 'react'
import type { ConfigDraft } from './draft'
import { ThemePreview } from './ThemePreview'

const agents: { key: AgentType; label: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'antigravity', label: 'Antigravity' },
  { key: 'codex', label: 'Codex' }
]

interface BarSettingsProps {
  disabled?: boolean
  draft: Config
  onChange(next: ConfigDraft): void
}

/** Presentation settings; Windows geometry remains read-only until issue #3. */
export function BarSettings({ draft, onChange, disabled }: BarSettingsProps) {
  const themeId = useId()
  const spacingId = useId()
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
      <Alert role="note">
        <AlertTitle>Geometria do Windows (somente leitura)</AlertTitle>
        <AlertDescription>
          <p>
            Altura {draft.bar.height}px · posição{' '}
            {draft.bar.position === 'top' ? 'superior' : 'inferior'} · sempre no
            topo {draft.bar.alwaysOnTop ? 'sim' : 'não'}
          </p>
          <p>
            A geometria é hospedada nativamente; editá-la chega com a issue #3.
          </p>
        </AlertDescription>
      </Alert>
      <AgentVisibility draft={draft} onChange={onChange} disabled={disabled} />
    </FieldGroup>
  )
}

function AgentVisibility({ draft, onChange, disabled }: BarSettingsProps) {
  const id = useId()
  return (
    <FieldSet data-disabled={disabled}>
      <FieldLegend id={id}>Agentes visíveis</FieldLegend>
      <FieldDescription id={`${id}-description`}>
        Escolha quais agentes aparecem na barra.
      </FieldDescription>
      <ToggleGroup
        multiple
        disabled={disabled}
        aria-labelledby={id}
        aria-describedby={`${id}-description`}
        variant="outline"
        className="flex-wrap"
        value={agents
          .filter(({ key }) => draft.agents.visible[key])
          .map(({ key }) => key)}
        onValueChange={(values) =>
          onChange({
            ...draft,
            agents: {
              ...draft.agents,
              visible: {
                ...draft.agents.visible,
                ...Object.fromEntries(
                  agents.map(({ key }) => [key, values.includes(key)])
                )
              }
            }
          })
        }
      >
        {agents.map(({ key, label }) => (
          <ToggleGroupItem
            key={key}
            value={key}
            aria-label={`Mostrar ${label} na barra`}
          >
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  )
}
