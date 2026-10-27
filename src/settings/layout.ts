import {
  type Config,
  type WidgetConfig,
  type WidgetType
} from '../services/configuration/config'

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
  weather: 'Clima',
  reminders: 'Lembretes',
  agents: 'Agentes',
  cpu: 'CPU',
  memory: 'RAM',
  gpu: 'GPU',
  disk: 'Discos',
  network: 'Rede',
  music: 'Música',
  mediaSpectrum: 'Espectro de mídia',
  volume: 'Volume',
  microphone: 'Microfone',
  activeWindow: 'Janela ativa',
  workspaces: 'Workspaces'
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
