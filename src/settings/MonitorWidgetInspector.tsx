import type { Config, WidgetConfig } from '@/services/configuration/config'
import type { MonitorDraft } from './monitor-layout'
import { WidgetInspector } from './WidgetInspector'
import { WidgetSettings } from './WidgetSettings'

export function MonitorWidgetInspector({
  widget,
  draft,
  onChange,
  editor
}: {
  widget: WidgetConfig
  draft: Config
  onChange(next: Config): void
  editor: MonitorDraft
}) {
  return (
    <div className="flex flex-col gap-4">
      <WidgetInspector
        widget={widget}
        onChange={(patch) => onChange(editor.updateWidget(widget.id, patch))}
        separatorMarginX={draft.bar.separatorMarginX}
        onSeparatorMarginChange={(separatorMarginX) =>
          onChange({
            ...draft,
            bar: { ...draft.bar, separatorMarginX }
          })
        }
      />
      {widget.type !== 'separator' && (
        <WidgetSettings widget={widget} draft={draft} onChange={onChange} />
      )}
    </div>
  )
}
