import {
  normalizeMonitorName,
  widgetSchema,
  type Config,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetType
} from '@/services/configuration/config'
import { isWidgetAvailable } from '@/services/configuration/widget-flags'
import { allWidgets, uniqueId, sections, type Section } from './layout'

export type WidgetEdit = Partial<
  Pick<WidgetConfig, 'intervalMs' | 'format' | 'tooltip' | 'workspaceSource'>
>

function defaultLayout(config: Config): WidgetLayout {
  return config.layout ?? membership(config.widgets)
}

function membership(widgets: Config['widgets']): WidgetLayout {
  return {
    left: widgets.left.map((widget) => widget.id),
    center: widgets.center.map((widget) => widget.id),
    right: widgets.right.map((widget) => widget.id)
  }
}

function project(config: Config, layout: WidgetLayout, key?: string): Config {
  const definitions = new Map(allWidgets(config).map((w) => [w.id, w]))
  const widgets: Config['widgets'] = { left: [], center: [], right: [] }
  for (const section of sections)
    widgets[section] = layout[section].map((id) => ({
      ...definitions.get(id)!,
      ...(key ? config.monitors[key]?.widgets?.[id] : undefined)
    }))
  return { ...config, widgets }
}

/** Read-only default composition for the shared appearance preview. */
export function defaultPreview(config: Config): Config {
  return project(config, defaultLayout(config))
}

/**
 * One monitor's Draft editing seam. Every operation returns the complete Draft;
 * callers never reconstruct membership or persist the projected document.
 * Hidden definitions and overrides survive removal so adding restores settings.
 */
export function editMonitorDraft(config: Config, monitorId: string) {
  if (!monitorId.trim()) throw new Error('Selecione um monitor para editar')
  const key =
    Object.keys(config.monitors).find(
      (id) => normalizeMonitorName(id) === normalizeMonitorName(monitorId)
    ) ?? monitorId
  const layout = config.monitors[key]?.layout ?? defaultLayout(config)
  const view = project(config, layout, key)

  function withLayout(next: Config, nextLayout: WidgetLayout): Config {
    const monitor = (next.monitors[key] ??= {})
    monitor.layout = structuredClone(nextLayout)
    return next
  }

  return {
    view,
    enabled: config.monitors[key]?.enabled ?? config.bar.enabled,
    setEnabled(enabled: boolean): Config {
      const next = structuredClone(config)
      const monitor = (next.monitors[key] ??= {})
      monitor.enabled = enabled
      return next
    },
    reorder(widgets: Config['widgets']): Config {
      return withLayout(structuredClone(config), membership(widgets))
    },
    add(type: WidgetType, to: { section: Section; index: number }): Config {
      if (!isWidgetAvailable(type)) return config
      const next = structuredClone(config)
      let widget =
        type === 'separator'
          ? undefined
          : allWidgets(next).find((item) => item.type === type)
      if (!widget) {
        // New definitions must not alter defaults or other monitors' inheritance.
        next.layout = structuredClone(defaultLayout(config))
        widget = widgetSchema.parse({ id: uniqueId(next, type), type })
        next.widgets[to.section].push(widget)
      }
      const nextLayout = structuredClone(layout)
      for (const section of sections)
        nextLayout[section] = nextLayout[section].filter(
          (id) => id !== widget.id
        )
      const index = Math.max(
        0,
        Math.min(to.index, nextLayout[to.section].length)
      )
      nextLayout[to.section].splice(index, 0, widget.id)
      return withLayout(next, nextLayout)
    },
    remove(id: string): Config {
      const nextLayout = structuredClone(layout)
      for (const section of sections)
        nextLayout[section] = nextLayout[section].filter((item) => item !== id)
      return withLayout(structuredClone(config), nextLayout)
    },
    updateWidget(id: string, patch: WidgetEdit): Config {
      const next = structuredClone(config)
      const monitor = (next.monitors[key] ??= {})
      monitor.widgets ??= {}
      monitor.widgets[id] = { ...monitor.widgets[id], ...patch }
      return next
    }
  }
}

export type MonitorDraft = ReturnType<typeof editMonitorDraft>
