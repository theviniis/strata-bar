import { z } from 'zod'
import type { ConfigSnapshot } from '@/services/system/config.generated'

export const types = [
  'clock',
  'reminders',
  'agents',
  'cpu',
  'memory',
  'gpu',
  'disk',
  'network',
  'music',
  'volume',
  'microphone',
  'activeWindow',
  'komorebi'
] as const

export type WidgetType = (typeof types)[number]

/** Voicemeeter destination of an audio widget: a strip or bus index on the engine. */
const vmTarget = z.object({
  kind: z.enum(['strip', 'bus']),
  index: z.number().int().min(0).max(7)
})

const audio = z
  .object({
    /** `windows` drives the default endpoints; `voicemeeter` drives a strip/bus. */
    source: z.enum(['windows', 'voicemeeter']).default('windows'),
    target: vmTarget.optional(),
    /** Friendly label shown by the widget instead of `Strip/Bus n`. */
    label: z.string().optional(),
    /** `false` keeps the stored target but drives the Windows endpoints again. */
    enabled: z.boolean().optional()
  })
  .superRefine((a, ctx) => {
    if (a.source === 'voicemeeter' && !a.target)
      ctx.addIssue({
        code: 'custom',
        message: 'Voicemeeter source requires a target strip or bus'
      })
  })

export type AudioSourceConfig = z.infer<typeof audio>
export type VmAudioTarget = z.infer<typeof vmTarget>

const widget = z.object({
  id: z.string().min(1),
  type: z.enum(types),
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(1000).max(60000).default(2000),
  format: z.enum(['compact', 'label']).default('label'),
  tooltip: z.boolean().default(true),
  /** Per-widget audio routing. Only the volume and microphone widgets consume it. */
  audio: audio.optional()
})

export { widget as widgetSchema }

/** Audio settings of the first widget of a type in the layout. */
export function widgetAudio(config: Config, type: WidgetType) {
  return [
    ...config.widgets.left,
    ...config.widgets.center,
    ...config.widgets.right
  ].find((w) => w.type === type)?.audio
}

/** Friendly Voicemeeter label; the configured override beats `Strip/Bus n`. */
export function voicemeeterLabel(audio: AudioSourceConfig): string {
  if (!audio.target) return 'Voicemeeter'
  return (
    audio.label ??
    `${audio.target.kind === 'strip' ? 'Strip' : 'Bus'} ${audio.target.index}`
  )
}

const bar = z.object({
  position: z.enum(['top', 'bottom']).default('top'),
  height: z.number().int().min(28).max(80).default(36),
  spacing: z.number().min(0).max(32).default(8),
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  alwaysOnTop: z.boolean().default(true)
})

export type WidgetConfig = z.infer<typeof widget>
export type BarConfig = z.infer<typeof bar>
export type Config = z.infer<typeof configSchema>
const widgetOverride = z.object({
  enabled: widget.shape.enabled.removeDefault().optional(),
  intervalMs: widget.shape.intervalMs.removeDefault().optional(),
  format: widget.shape.format.removeDefault().optional(),
  tooltip: widget.shape.tooltip.removeDefault().optional(),
  audio: widget.shape.audio
})
const monitorOverride = z.object({
  position: bar.shape.position.removeDefault().optional(),
  height: bar.shape.height.removeDefault().optional(),
  spacing: bar.shape.spacing.removeDefault().optional(),
  theme: bar.shape.theme.removeDefault().optional(),
  alwaysOnTop: bar.shape.alwaysOnTop.removeDefault().optional(),
  widgets: z.record(z.string(), widgetOverride).optional()
})

const agentVisibility = z.object({
  chatgpt: z.boolean().default(true),
  opencode: z.boolean().default(true),
  antigravity: z.boolean().default(true),
  codex: z.boolean().default(true)
})

export const configSchema = z
  .object({
    /**
     * Pointer to the published JSON Schema. Editors use it for completion and
     * inline range errors while a document is hand-edited. Kept on the document
     * so a save round-trips it instead of dropping the author's pointer.
     */
    $schema: z.string().optional(),
    version: z.literal(1),
    agents: z
      .object({
        visible: agentVisibility.default(() => agentVisibility.parse({}))
      })
      .default(() => ({ visible: agentVisibility.parse({}) })),
    bar,
    widgets: z.object({
      left: z.array(widget),
      center: z.array(widget),
      right: z.array(widget)
    }),
    monitors: z.record(z.string(), monitorOverride).default({})
  })
  .superRefine((c, ctx) => {
    const ids = Object.values(c.widgets)
      .flat()
      .map((w) => w.id)
    for (const [monitor, override] of Object.entries(c.monitors)) {
      for (const id of Object.keys(override.widgets ?? {})) {
        if (!ids.includes(id))
          ctx.addIssue({
            code: 'custom',
            path: ['monitors', monitor, 'widgets', id],
            message: 'Unknown widget ID'
          })
      }
    }
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Widget IDs must be unique' })
  })

export const defaultConfig = configSchema.parse({
  version: 1,
  bar: {},
  widgets: {
    left: [
      { id: 'workspaces', type: 'komorebi' },
      { id: 'active', type: 'activeWindow' }
    ],
    center: [{ id: 'time', type: 'clock' }],
    right: [
      'cpu',
      'memory',
      'gpu',
      'disk',
      'network',
      'music',
      'volume',
      'microphone',
      'reminders',
      'agents'
    ].map((type) => ({
      id: type,
      type
    }))
  }
})

export function parseConfig(text: string): Config {
  return configSchema.parse(JSON.parse(text))
}

/** A native snapshot with its document validated and defaulted. */
export interface ConfigDocument {
  revision: number
  config: Config
  error: string | null
}

/** Validates a native snapshot at runtime; the generated type is unchecked wire data. */
export function parseSnapshot(snapshot: ConfigSnapshot): ConfigDocument {
  // Keep the parsed result: Zod fills any field the native document omitted.
  return {
    revision: snapshot.revision,
    config: configSchema.parse(snapshot.config),
    error: snapshot.error ?? null
  }
}

export const storageKey = 'strata.config.v1'
