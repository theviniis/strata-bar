import type { Config, WidgetConfig } from '@/services/configuration/config'
import type { SettingsMonitor } from '@/services/system/config.generated'
import {
  effectiveWidget,
  patchWidget,
  aggregateIds,
  type Scope
} from './monitor-layout'
import { WidgetInspector } from './WidgetInspector'
import { WidgetSettings } from './WidgetSettings'

export function MonitorWidgetInspector({
  widget,
  draft,
  onChange,
  scope = null,
  monitors = []
}: {
  widget: WidgetConfig
  draft: Config
  onChange(next: Config): void
  scope?: Scope
  monitors?: SettingsMonitor[]
}) {
  if (widget.type === 'separator') {
    return (
      <WidgetInspector
        widget={widget}
        onChange={() => {}}
        separatorMarginX={draft.bar.separatorMarginX}
        onSeparatorMarginChange={(separatorMarginX) =>
          onChange({
            ...draft,
            bar: { ...draft.bar, separatorMarginX }
          })
        }
      />
    )
  }
  const target = scope
  const values = aggregateIds(target, monitors).map((monitor) =>
    effectiveWidget(draft, widget.id, monitor)
  )
  return (
    <div className="flex flex-col gap-4">
      <WidgetInspector
        widget={values[0]}
        values={values}
        onChange={() => {}}
        onPatch={(path, value) =>
          onChange(patchWidget(draft, target, monitors, widget.id, path, value))
        }
      />
      <WidgetSettings widget={widget} draft={draft} onChange={onChange} />
    </div>
  )
}
