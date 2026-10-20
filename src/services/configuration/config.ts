import { z } from 'zod'

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

const widget = z.object({
  id: z.string().min(1),
  type: z.enum(types),
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(1000).max(60000).default(2000),
  format: z.enum(['compact', 'label']).default('label'),
  tooltip: z.boolean().default(true)
})

const bar = z.object({
  position: z.enum(['top', 'bottom']).default('top'),
  height: z.number().int().min(28).max(80).default(36),
  spacing: z.number().min(0).max(32).default(8),
  theme: z.enum(['dark', 'light']).default('dark'),
  alwaysOnTop: z.boolean().default(true)
})

export type WidgetConfig = z.infer<typeof widget>
export type BarConfig = z.infer<typeof bar>
export type Config = z.infer<typeof configSchema>

const agentVisibility = z.object({
  chatgpt: z.boolean().default(true),
  opencode: z.boolean().default(true),
  antigravity: z.boolean().default(true),
  codex: z.boolean().default(true)
})

export const configSchema = z
  .object({
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
    monitors: z.record(z.string(), bar.partial()).default({})
  })
  .superRefine((c, ctx) => {
    const ids = Object.values(c.widgets)
      .flat()
      .map((w) => w.id)
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

export const storageKey = 'strata.config.v1'
