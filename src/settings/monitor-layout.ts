import {
  normalizeMonitorName,
  widgetSchema,
  type Config,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetType
} from '@/services/configuration/config'
import { isWidgetAvailable } from '@/services/configuration/widget-flags'
import {
  allWidgets,
  findWidget,
  moveWidget,
  uniqueId,
  sections,
  type Section
} from './layout'

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
    move(id: string, to: { section: Section; index: number }): Config {
      const next = moveWidget(view, id, to)
      return next === view
        ? config
        : withLayout(structuredClone(config), membership(next.widgets))
    },
    beginMove(id: string): MonitorLayoutMove {
      return beginLayoutMove(view, id)
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

export type MonitorLayoutMove = {
  /** Temporary composition only; never a document to persist. */
  view: Config
  widget: WidgetConfig | undefined
  preview(overId: string, after: boolean): MonitorLayoutMove
  drop(
    editor: MonitorDraft,
    overId: string | null,
    input: 'pointer' | 'keyboard'
  ): Config | undefined
}

function dropTarget(config: Config, id: string) {
  if (!id.startsWith('section:')) return findWidget(config, id)
  const section = id.slice('section:'.length) as Section
  return { section, index: config.widgets[section].length }
}

/** A move owns its preview identities and all conversion back to the Draft. */
function beginLayoutMove(view: Config, sourceId: string): MonitorLayoutMove {
  const catalog = sourceId.startsWith('catalog:')
  const type = catalog
    ? (sourceId.slice('catalog:'.length) as WidgetType)
    : null
  const id = catalog ? `preview:${sourceId}` : sourceId
  let initial = view
  if (type) {
    initial = structuredClone(view)
    // The catalog handle and the sortable preview must have different IDs.
    initial.widgets.right.push(widgetSchema.parse({ id, type }))
  }

  function projectMove(current: Config): MonitorLayoutMove {
    const location = findWidget(current, id)
    const move: MonitorLayoutMove = {
      view: current,
      widget: location
        ? current.widgets[location.section][location.index]
        : undefined,
      preview(overId, after) {
        if (sourceId === overId) return move
        const from = findWidget(current, id)
        const target = dropTarget(current, overId)
        if (!from || !target) return move
        let index = target.index
        if (!overId.startsWith('section:') && after) index += 1
        if (from.section === target.section && from.index < index) index -= 1
        if (from.section === target.section && from.index === index) return move
        return projectMove(
          moveWidget(current, id, { section: target.section, index })
        )
      },
      drop(editor, overId, input) {
        if (!overId) return
        if (type) {
          const target =
            input === 'keyboard'
              ? dropTarget(current, overId)
              : findWidget(current, id)
          if (target) return editor.add(type, target)
          return
        }
        if (input === 'pointer') {
          if (current !== editor.view) return editor.reorder(current.widgets)
          return
        }
        if (sourceId === overId) return
        const target = dropTarget(editor.view, overId)
        if (!target) return
        const next = moveWidget(current, sourceId, target)
        if (next !== editor.view) return editor.reorder(next.widgets)
      }
    }
    return move
  }

  return projectMove(initial)
}
