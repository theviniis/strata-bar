import {
  normalizeMonitorName,
  widgetSchema,
  type Config,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetType
} from '@/services/configuration/config'
import type { SettingsMonitor } from '@/services/system/config.generated'
import { allWidgets, uniqueId, sections, type Section } from './layout'

export type Scope = string | null
export function monitorKey(config: Config, id: string) {
  return (
    Object.keys(config.monitors).find(
      (key) => normalizeMonitorName(key) === normalizeMonitorName(id)
    ) ?? id
  )
}
export function layoutFor(config: Config, monitor: Scope): WidgetLayout {
  return (
    (monitor
      ? config.monitors[monitorKey(config, monitor)]?.layout
      : undefined) ??
    config.layout ?? {
      left: config.widgets.left.map((w) => w.id),
      center: config.widgets.center.map((w) => w.id),
      right: config.widgets.right.map((w) => w.id)
    }
  )
}
export function effectiveWidget(
  config: Config,
  id: string,
  monitor: Scope
): WidgetConfig {
  const widget = allWidgets(config).find((w) => w.id === id)!
  return {
    ...widget,
    ...(monitor
      ? config.monitors[monitorKey(config, monitor)]?.widgets?.[id]
      : undefined)
  }
}
export function scopedIds(scope: Scope, monitors: SettingsMonitor[]): Scope[] {
  return scope ? [scope] : [null, ...monitors.map((m) => m.id)]
}
export function aggregateIds(
  scope: Scope,
  monitors: SettingsMonitor[]
): Scope[] {
  return scope ? [scope] : monitors.length ? monitors.map((m) => m.id) : [null]
}
export function displayedLayout(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[]
): WidgetLayout {
  if (scope) return layoutFor(config, scope)
  const result = structuredClone(layoutFor(config, null))
  if (monitors.length) {
    const present = new Set(
      monitors.flatMap((m) => Object.values(layoutFor(config, m.id)).flat())
    )
    for (const section of sections)
      result[section] = result[section].filter((id) => present.has(id))
  }
  const seen = new Set(Object.values(result).flat())
  for (const monitor of monitors)
    for (const section of sections)
      for (const id of layoutFor(config, monitor.id)[section]) {
        if (!seen.has(id)) {
          result[section].push(id)
          seen.add(id)
        }
      }
  return result
}
export function viewConfig(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[]
): Config {
  const layout = displayedLayout(config, scope, monitors)
  return {
    ...config,
    widgets: Object.fromEntries(
      sections.map((section) => [
        section,
        layout[section].map((id) => effectiveWidget(config, id, scope))
      ])
    ) as Config['widgets']
  }
}
export function barEnabled(config: Config, monitor: Scope) {
  return (
    (monitor
      ? config.monitors[monitorKey(config, monitor)]?.enabled
      : undefined) ?? config.bar.enabled
  )
}
function entry(config: Config, id: string) {
  const key = monitorKey(config, id)
  return (config.monitors[key] ??= {})
}
export function setBarEnabled(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[],
  enabled: boolean
) {
  const next = structuredClone(config)
  for (const id of scopedIds(scope, monitors)) {
    if (id) entry(next, id).enabled = enabled
    else next.bar.enabled = enabled
  }
  return next
}
export function setLayout(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[],
  layout: WidgetLayout
) {
  const next = structuredClone(config)
  for (const id of scopedIds(scope, monitors)) {
    if (id) entry(next, id).layout = structuredClone(layout)
    else {
      next.layout = structuredClone(layout)
      const definitions = allWidgets(next)
      const members = new Set(Object.values(layout).flat())
      const previous = next.widgets
      next.widgets = Object.fromEntries(
        sections.map((section) => [
          section,
          [
            ...layout[section].map((id) =>
              definitions.find((w) => w.id === id)!
            ),
            ...previous[section].filter((w) => !members.has(w.id))
          ]
        ])
      ) as Config['widgets']
    }
  }
  return next
}

/** Patch one leaf of each effective value, retaining unrelated audio fields too. */
export function patchWidget(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[],
  id: string,
  path: string,
  value: unknown
): Config {
  const next = structuredClone(config)
  const definitions = allWidgets(next)
  for (const monitor of scopedIds(scope, monitors).reverse()) {
    const widget = structuredClone(effectiveWidget(config, id, monitor))
    const keys = path.split('.')
    let target = widget as unknown as Record<string, unknown>
    for (const key of keys.slice(0, -1)) {
      target[key] ??=
        key === 'audio'
          ? { source: 'windows' }
          : { kind: widget.type === 'volume' ? 'bus' : 'strip', index: 0 }
      target = target[key] as Record<string, unknown>
    }
    target[keys.at(-1)!] = value
    if (widget.audio?.source === 'voicemeeter' && !widget.audio.target)
      widget.audio.target = {
        kind: widget.type === 'volume' ? 'bus' : 'strip',
        index: 0
      }
    if (!monitor)
      Object.assign(
        definitions.find((w) => w.id === id)!,
        { [keys[0]]: widget[keys[0] as keyof WidgetConfig] }
      )
    else {
      const over = entry(next, monitor)
      over.widgets ??= {}
      over.widgets[id] = {
        ...over.widgets[id],
        [keys[0]]: widget[keys[0] as keyof WidgetConfig]
      }
    }
  }
  return next
}
export function addToScope(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[],
  type: WidgetType,
  to: { section: Section; index: number }
) {
  let next = structuredClone(config)
  let widget = allWidgets(next).find((w) => w.type === type)
  if (!widget) {
    // Freeze inherited membership before extending the global catalog.
    next.layout = structuredClone(layoutFor(next, null))
    widget = widgetSchema.parse({ id: uniqueId(next, type), type })
    next.widgets[to.section].push(widget)
  }
  for (const monitor of scopedIds(scope, monitors).reverse()) {
    const layout = structuredClone(layoutFor(next, monitor))
    for (const section of sections)
      layout[section] = layout[section].filter((id) => id !== widget.id)
    layout[to.section].splice(to.index, 0, widget.id)
    next = setLayout(next, monitor, [], layout)
  }
  return next
}
export function removeFromScope(
  config: Config,
  scope: Scope,
  monitors: SettingsMonitor[],
  id: string
) {
  let next = structuredClone(config)
  for (const monitor of scopedIds(scope, monitors).reverse()) {
    const layout = structuredClone(layoutFor(next, monitor))
    for (const section of sections)
      layout[section] = layout[section].filter((item) => item !== id)
    next = setLayout(next, monitor, [], layout)
  }
  if (!scope) {
    for (const section of sections)
      next.widgets[section] = next.widgets[section].filter((w) => w.id !== id)
    for (const over of Object.values(next.monitors)) {
      delete over.widgets?.[id]
      if (over.layout)
        for (const section of sections)
          over.layout[section] = over.layout[section].filter(
            (item) => item !== id
          )
    }
  }
  return next
}
export function valueAt(widget: WidgetConfig, path: string): unknown {
  const value = path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      widget
    )
  if (value !== undefined) return value
  switch (path) {
    case 'audio.source':
      return 'windows'
    case 'audio.label':
      return ''
    case 'audio.enabled':
      return true
    case 'audio.target.kind':
      return widget.type === 'volume' ? 'bus' : 'strip'
    case 'audio.target.index':
      return 0
    default:
      return value
  }
}
