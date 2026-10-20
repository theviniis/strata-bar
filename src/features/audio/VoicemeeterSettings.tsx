import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldLabel } from '@/components/ui/field'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import {
  voicemeeterLabel,
  widgetAudio,
  type WidgetType
} from '@/services/configuration/config'
import type { VoicemeeterData } from '@/services/system/bridge'
import { useConfig } from '@/stores/config'
import { Check } from 'lucide-react'

/** Display text of one Voicemeeter option: engine slot plus device/label. */
export function optionLabel(item: VoicemeeterData['strips'][number]) {
  const name = item.name.trim()
  return name ? `${item.slot} · ${name}` : item.slot
}

interface VoicemeeterSettingsProps {
  /** The widget whose routing this popup settings view edits. */
  type: WidgetType
  /** Strips feed the microphone, buses feed the volume. */
  kind: 'strip' | 'bus'
}

/**
 * Configuration view of the audio popups (behind the gear button): a checkbox
 * turns Voicemeeter routing on or off, and when it is on the radio list picks
 * the engine strip (microphone) or bus (volume). The engine list arrives on
 * the dedicated `voicemeeter` channel.
 */
export function VoicemeeterSettings({ type, kind }: VoicemeeterSettingsProps) {
  const voice = useSystemChannel('voicemeeter')
  const audio = useConfig((state) => widgetAudio(state.config, type))
  const setWidgetAudio = useConfig((state) => state.setWidgetAudio)

  const items =
    voice.status === 'ready'
      ? kind === 'strip'
        ? voice.data.strips
        : voice.data.buses
      : []
  const enabled =
    audio?.source === 'voicemeeter' && !!audio.target && audio.enabled !== false
  const checkboxId = `voicemeeter-enabled-${kind}`

  /** Disabling keeps the stored target; enabling restores it (or the first). */
  function toggle(checked: boolean | 'indeterminate') {
    if (audio?.source === 'voicemeeter' && audio.target) {
      if (!checked) {
        setWidgetAudio(type, { ...audio, enabled: false })
        return
      }
      const found = items.find((item) => item.index === audio.target!.index)
      setWidgetAudio(type, {
        source: 'voicemeeter',
        target: audio.target,
        label: found ? optionLabel(found) : audio.label,
        enabled: true
      })
      return
    }
    if (!checked) {
      setWidgetAudio(type, undefined)
      return
    }
    const target = { kind, index: 0 }
    const found = items.find((item) => item.index === target.index)
    setWidgetAudio(type, {
      source: 'voicemeeter',
      target,
      label: found
        ? optionLabel(found)
        : voicemeeterLabel({ source: 'voicemeeter', target })
    })
  }

  function select(value: string) {
    const target = { kind, index: Number(value) }
    const found = items.find((item) => item.index === target.index)
    setWidgetAudio(type, {
      source: 'voicemeeter',
      target,
      label: found
        ? optionLabel(found)
        : voicemeeterLabel({ source: 'voicemeeter', target })
    })
  }

  const fallback = enabled ? voicemeeterLabel(audio!) : ''

  return (
    <div className="grid gap-4">
      <Field orientation="horizontal">
        <Checkbox id={checkboxId} checked={enabled} onCheckedChange={toggle} />
        <FieldLabel htmlFor={checkboxId}>Usar Voicemeeter</FieldLabel>
      </Field>
      {enabled ? (
        <ButtonGroup
          orientation="vertical"
          aria-label={`Faixa de Voicemeeter controlando ${voiceLabel(kind)}`}
        >
          {items.map((item) => {
            const isActive = enabled && audio!.target!.index === item.index
            return (
              <Button
                key={item.index}
                className="grid grid-cols-[1fr_16px] items-center justify-start text-left w-full"
                variant="outline"
                aria-pressed={isActive}
                aria-label={`Faixa de Voicemeeter controlando ${voiceLabel(kind)}`}
                onClick={() => select(String(item.index))}
              >
                {isActive && (
                  <Check
                    size={16}
                    aria-label={
                      kind === 'bus' ? 'Saída atual' : 'Entrada atual'
                    }
                    className="shrink-0 text-primary justify-self-end"
                  />
                )}
                <span className="text-left truncate">{optionLabel(item)}</span>
              </Button>
            )
          })}
        </ButtonGroup>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          O mute e o slider agem no dispositivo padrão do Windows.
        </p>
      )}
      {enabled && voice.status !== 'ready' && items.length === 0 && (
        <p
          role={voice.status === 'error' ? 'alert' : undefined}
          className={
            voice.status === 'error'
              ? 'text-[11px] text-destructive'
              : 'text-[11px] text-muted-foreground'
          }
        >
          <span>
            {voice.status === 'error'
              ? voice.error
              : 'Voicemeeter não está em execução.'}
          </span>
          {voice.status !== 'error' && fallback && (
            <span> Alvo atual: {fallback}.</span>
          )}
        </p>
      )}
    </div>
  )
}

function voiceLabel(kind: 'strip' | 'bus') {
  return kind === 'bus' ? 'a saída' : 'a entrada'
}
