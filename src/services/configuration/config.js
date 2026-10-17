import { z } from 'zod';
export const types = [
  'clock',
  'cpu',
  'memory',
  'gpu',
  'network',
  'volume',
  'activeWindow',
];
const widget = z.object({
  id: z.string().min(1),
  type: z.enum(types),
  enabled: z.boolean().default(true),
  intervalMs: z.number().int().min(1000).max(60000).default(2000),
  format: z.enum(['compact', 'label']).default('label'),
  tooltip: z.boolean().default(true),
});
const bar = z.object({
  position: z.enum(['top', 'bottom']).default('top'),
  height: z.number().int().min(28).max(80).default(36),
  spacing: z.number().min(0).max(32).default(8),
  theme: z.enum(['dark', 'light']).default('dark'),
  alwaysOnTop: z.boolean().default(true),
});
export const configSchema = z
  .object({
    version: z.literal(1),
    bar,
    widgets: z.object({
      left: z.array(widget),
      center: z.array(widget),
      right: z.array(widget),
    }),
    monitors: z.record(z.string(), bar.partial()).default({}),
  })
  .superRefine((c, ctx) => {
    const ids = Object.values(c.widgets)
      .flat()
      .map((w) => w.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'Widget IDs must be unique' });
  });
export const defaultConfig = configSchema.parse({
  version: 1,
  bar: {},
  widgets: {
    left: [{ id: 'active', type: 'activeWindow' }],
    center: [{ id: 'time', type: 'clock' }],
    right: ['cpu', 'memory', 'gpu', 'network', 'volume'].map((type) => ({
      id: type,
      type,
    })),
  },
});
export function parseConfig(text) {
  return configSchema.parse(JSON.parse(text));
}
export const storageKey = 'strata.config.v1';
