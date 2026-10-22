import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { AgentType } from '@/services/system/agents.generated'
import type { Config } from '@/services/configuration/config'
import type { ConfigDraft } from './draft'

const agents: { key: AgentType; label: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'opencode', label: 'OpenCode' },
  { key: 'antigravity', label: 'Antigravity' },
  { key: 'codex', label: 'Codex' }
]

interface BarSettingsProps {
  draft: Config
  onChange(next: ConfigDraft): void
}

/**
 * Bar-level presentation. `theme` and `spacing` are applied by the native bar,
 * so they are editable here. `height`, `position` and `alwaysOnTop` are hosted
 * by Windows today, not by the configuration: showing editable controls for
 * fields an Apply would not honour would make the page lie, so they stay
 * read-only with a pointer to the geometry follow-up (#3).
 */
export function BarSettings({ draft, onChange }: BarSettingsProps) {
  const spacingId = useId()
  return (
    <section className="grid gap-4" aria-label="Barra">
      <div className="grid gap-2">
        <span className="text-sm font-medium">Aparência</span>
        <div className="flex gap-2">
          {(['dark', 'light'] as const).map((theme) => (
            <Button
              key={theme}
              type="button"
              size="sm"
              variant={draft.bar.theme === theme ? 'default' : 'outline'}
              aria-pressed={draft.bar.theme === theme}
              onClick={() =>
                onChange({
                  ...draft,
                  bar: { ...draft.bar, theme }
                })
              }
            >
              {theme === 'dark' ? 'Escuro' : 'Claro'}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={spacingId}>
          Espaçamento entre widgets ({draft.bar.spacing}px)
        </Label>
        <input
          id={spacingId}
          type="range"
          min={0}
          max={32}
          step={1}
          value={draft.bar.spacing}
          onChange={(event) =>
            onChange({
              ...draft,
              bar: { ...draft.bar, spacing: Number(event.target.value) }
            })
          }
        />
      </div>
      <div className="grid gap-1 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Geometria do Windows (somente leitura)
        </span>
        <span>
          Altura {draft.bar.height}px · posição{' '}
          {draft.bar.position === 'top' ? 'superior' : 'inferior'} · sempre no
          topo {draft.bar.alwaysOnTop ? 'sim' : 'não'}
        </span>
        <span>
          A geometria é hospedada nativamente; editá-la chega com a issue #3.
        </span>
      </div>
      <AgentVisibility draft={draft} onChange={onChange} />
    </section>
  )
}

function AgentVisibility({ draft, onChange }: BarSettingsProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">Agentes visíveis</legend>
      {agents.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between gap-3">
          <Label htmlFor={`agent-${key}`}>{label}</Label>
          <Switch
            id={`agent-${key}`}
            aria-label={`Mostrar ${label} na barra`}
            checked={draft.agents.visible[key]}
            onCheckedChange={(visible) =>
              onChange({
                ...draft,
                agents: {
                  ...draft.agents,
                  visible: { ...draft.agents.visible, [key]: visible }
                }
              })
            }
          />
        </div>
      ))}
    </fieldset>
  )
}
