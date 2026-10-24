import {
  types,
  widgetSchema,
  type Config,
  type WidgetConfig,
  type WidgetType
} from '../services/configuration/config'
import { isWidgetAvailable } from '../services/configuration/widget-flags'

export const sections = ['left', 'center', 'right'] as const
export type Section = (typeof sections)[number]

export const sectionLabels: Record<Section, string> = {
  left: 'Esquerda',
  center: 'Centro',
  right: 'Direita'
}

/** Display label of a widget type, matching the bar's vocabulary. */
export const typeLabels: Record<WidgetType, string> = {
  separator: 'Separador',
  clock: 'Relógio',
  reminders: 'Lembretes',
  agents: 'Agentes',
  cpu: 'CPU',
  memory: 'RAM',
  gpu: 'GPU',
  disk: 'Discos',
  network: 'Rede',
  music: 'Música',
  volume: 'Volume',
  microphone: 'Microfone',
  activeWindow: 'Janela ativa',
  komorebi: 'Workspaces'
}

/**
 * Generates a widget ID that cannot collide across all three sections. The
 * schema's uniqueness `superRefine` stays the backstop, but the editor never
 * hands a duplicate to it: a second `cpu` becomes `cpu-2`, never a rejection.
 */
export function uniqueId(config: Config, base: string): string {
  const taken = new Set(allWidgets(config).map((widget) => widget.id))
  if (!taken.has(base)) return base
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

export function allWidgets(config: Config): WidgetConfig[] {
  return [
    ...config.widgets.left,
    ...config.widgets.center,
    ...config.widgets.right
  ]
}

/** The section and index holding a widget ID, or `undefined` when absent. */
export function findWidget(
  config: Config,
  id: string
): { section: Section; index: number } | undefined {
  for (const section of sections) {
    const index = config.widgets[section].findIndex((w) => w.id === id)
    if (index >= 0) return { section, index }
  }
  return undefined
}

/**
 * Reorders a widget inside a section or moves it to another one. The returned
 * document is new; the caller installs it as the draft, so an invalid move can
 * never mutate what is being rendered.
 */
export function moveWidget(
  config: Config,
  id: string,
  to: { section: Section; index: number }
): Config {
  const from = findWidget(config, id)
  if (!from) return config
  const next = {
    ...config,
    widgets: {
      ...config.widgets,
      [from.section]: [...config.widgets[from.section]],
      ...(from.section !== to.section && {
        [to.section]: [...config.widgets[to.section]]
      })
    }
  }
  const [widget] = next.widgets[from.section].splice(from.index, 1)
  if (!widget) return config
  const target = Math.max(
    0,
    Math.min(to.index, next.widgets[to.section].length)
  )
  next.widgets[to.section].splice(target, 0, widget)
  return next
}

/** Appends a new widget of `type` to `section` with a collision-free ID. */
export function addWidget(
  config: Config,
  type: WidgetType,
  section: Section
): Config {
  if (!isWidgetAvailable(type)) return config
  const next = structuredClone(config)
  next.widgets[section].push(
    widgetSchema.parse({ id: uniqueId(next, type), type })
  )
  return next
}

/** Removes a widget by ID, leaving every other widget untouched. */
export function removeWidget(config: Config, id: string): Config {
  const found = findWidget(config, id)
  if (!found) return config
  const next = structuredClone(config)
  next.widgets[found.section].splice(found.index, 1)
  if (next.layout)
    for (const section of sections)
      next.layout[section] = next.layout[section].filter((item) => item !== id)
  for (const monitor of Object.values(next.monitors)) {
    delete monitor.widgets?.[id]
    if (monitor.layout)
      for (const section of sections)
        monitor.layout[section] = monitor.layout[section].filter(
          (item) => item !== id
        )
  }
  return next
}

/**
 * Disables a widget in place instead of deleting it: its interval, format and
 * routing survive, so toggling it back restores the previous configuration.
 */
export function toggleWidget(config: Config, id: string): Config {
  const found = findWidget(config, id)
  if (!found) return config
  const next = structuredClone(config)
  const widget = next.widgets[found.section][found.index]
  widget.enabled = !widget.enabled
  return next
}

/** Widget types a user may add (the schema's full set, in a stable order). */
export function addableTypes(): WidgetType[] {
  return types.filter(isWidgetAvailable)
}
