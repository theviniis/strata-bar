import type { ConfigSnapshot } from '@/services/system/config.generated'
import { z } from 'zod'

import defaultDocument from './default.json' with { type: 'json' }

export const weatherCitySchema = z.strictObject({
  id: z.number().int().min(0).max(4_294_967_295),
  name: z.string().trim().min(1).max(256),
  region: z.string().max(256),
  country: z.string().max(256),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  timezone: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9/_+-]+$/)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat('pt-BR', { timeZone: value })
        return true
      } catch {
        return false
      }
    }, 'Fuso horário inválido')
})
export const weatherConfigSchema = z.strictObject({
  city: weatherCitySchema.nullable().default(null),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  windUnit: z.enum(['kmh', 'mph']).default('kmh')
})

export const types = [
  'separator',
  'clock',
  'weather',
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

/** Global channel settings; destination kind is fixed by the channel. */
const audioChannel = z.strictObject({
  source: z.enum(['windows', 'voicemeeter']).default('windows'),
  targetIndex: z.number().int().min(0).max(7).default(0)
})
const audio = z.strictObject({
  output: audioChannel.default(() => audioChannel.parse({})),
  input: audioChannel.default(() => audioChannel.parse({}))
})
export type AudioSourceConfig = z.infer<typeof audioChannel>

const widget = z.strictObject({
  id: z.string().min(1),
  type: z.enum(types),
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(1000).max(60000).default(2000),
  format: z.enum(['compact', 'label']).default('label'),
  tooltip: z.boolean().default(true),
  marginX: z.number().min(0).max(32).optional()
})

export { widget as widgetSchema }

export const colorThemeSchema = z.enum([
  'current',
  'amoled',
  'nord',
  'dracula',
  'catppuccin'
])
export type ColorTheme = z.infer<typeof colorThemeSchema>

const bar = z.object({
  enabled: z.boolean().default(true),
  position: z.enum(['top', 'bottom']).default('top'),
  height: z.number().int().min(28).max(80).default(36),
  cornerRadius: z.number().min(0).max(40).optional(),
  spacing: z.number().min(0).max(32).default(8),
  /** Shared by every separator on every monitor; absent means zero. */
  separatorMarginX: z.number().min(0).max(32).optional(),
  theme: z.enum(['system', 'dark', 'light']).default('system'),
  colorTheme: colorThemeSchema.default('current'),
  alwaysOnTop: z.boolean().default(true)
})

export type WidgetConfig = z.infer<typeof widget>
export type BarConfig = z.infer<typeof bar>
export type Config = z.infer<typeof configSchema>
/** Windows device prefix and case are aliases for the same monitor. */
export function normalizeMonitorName(name: string): string {
  return name
    .trim()
    .replace(/^\\\\\.\\/, '')
    .trim()
    .toUpperCase()
}

const widgetOverride = z.strictObject({
  enabled: widget.shape.enabled.removeDefault().optional(),
  intervalMs: widget.shape.intervalMs.removeDefault().optional(),
  format: widget.shape.format.removeDefault().optional(),
  tooltip: widget.shape.tooltip.removeDefault().optional(),
  marginX: widget.shape.marginX
})
export const widgetLayoutSchema = z.object({
  left: z.array(z.string()),
  center: z.array(z.string()),
  right: z.array(z.string())
})
export type WidgetLayout = z.infer<typeof widgetLayoutSchema>
const monitorOverride = z.object({
  enabled: z.boolean().optional(),
  layout: widgetLayoutSchema.optional(),
  position: bar.shape.position.removeDefault().optional(),
  height: bar.shape.height.removeDefault().optional(),
  cornerRadius: bar.shape.cornerRadius,
  spacing: bar.shape.spacing.removeDefault().optional(),
  theme: bar.shape.theme.removeDefault().optional(),
  colorTheme: bar.shape.colorTheme.removeDefault().optional(),
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
    version: z.literal(2),
    weather: weatherConfigSchema.optional(),
    audio: audio.default(() => audio.parse({})),
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
    layout: widgetLayoutSchema.optional(),
    monitors: z.record(z.string(), monitorOverride).default({})
  })
  .superRefine((c, ctx) => {
    const ids = Object.values(c.widgets)
      .flat()
      .map((w) => w.id)
    for (const [path, layout] of [
      [['layout'], c.layout],
      ...Object.entries(c.monitors).map(
        ([key, value]) => [['monitors', key, 'layout'], value.layout] as const
      )
    ] as const) {
      if (!layout) continue
      const seen = new Set<string>()
      for (const id of Object.values(layout).flat()) {
        if (!ids.includes(id) || seen.has(id))
          ctx.addIssue({
            code: 'custom',
            path: [...path],
            message: `Unknown or repeated widget ${id}`
          })
        seen.add(id)
      }
    }
    const monitors = new Set<string>()
    for (const [monitor, override] of Object.entries(c.monitors)) {
      const normalized = normalizeMonitorName(monitor)
      if (!normalized)
        ctx.addIssue({
          code: 'custom',
          path: ['monitors', monitor],
          message: 'Monitor name must not be empty'
        })
      if (monitors.has(normalized))
        ctx.addIssue({
          code: 'custom',
          path: ['monitors', monitor],
          message: 'Duplicate monitor name'
        })
      monitors.add(normalized)
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

export const defaultConfig = configSchema.parse(defaultDocument)

/** Version 1 audio was per widget/monitor; migrate it to Windows globally. */
export function migrateConfig(value: unknown): unknown {
  if (
    !value ||
    typeof value !== 'object' ||
    !('version' in value) ||
    value.version !== 1
  )
    return value
  const next = structuredClone(value) as Record<string, unknown>
  next.version = 2
  next.audio = {
    output: { source: 'windows', targetIndex: 0 },
    input: { source: 'windows', targetIndex: 0 }
  }
  const removeAudio = (widget: unknown) => {
    if (widget && typeof widget === 'object' && !Array.isArray(widget))
      delete (widget as Record<string, unknown>).audio
  }
  if (next.widgets && typeof next.widgets === 'object')
    for (const section of Object.values(next.widgets))
      if (Array.isArray(section)) section.forEach(removeAudio)
  if (next.monitors && typeof next.monitors === 'object')
    for (const monitor of Object.values(next.monitors))
      if (
        monitor &&
        typeof monitor === 'object' &&
        'widgets' in monitor &&
        monitor.widgets &&
        typeof monitor.widgets === 'object'
      )
        Object.values(monitor.widgets).forEach(removeAudio)
  return next
}

export function parseConfig(text: string): Config {
  return configSchema.parse(migrateConfig(JSON.parse(text)))
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
    config: configSchema.parse(migrateConfig(snapshot.config)),
    error: snapshot.error ?? null
  }
}

export const storageKey = 'strata.config.v1'
