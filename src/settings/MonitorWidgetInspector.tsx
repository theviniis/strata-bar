import { useState } from 'react'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import type { SettingsMonitor } from '@/services/system/config.generated'
import {
  effectiveWidget,
  patchWidget,
  aggregateIds,
  type Scope
} from './monitor-layout'
import { Choice, WidgetInspector } from './WidgetInspector'

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
  const [all, setAll] = useState(!scope)
  const target = all ? null : scope
  const values = aggregateIds(target, monitors).map((monitor) =>
    effectiveWidget(draft, widget.id, monitor)
  )
  return (
    <div className="flex flex-col gap-4">
      <Choice
        label="Aplicar configurações em"
        value={all ? 'all' : 'current'}
        options={
          scope
            ? [
                { value: 'current', label: 'Monitor atual' },
                { value: 'all', label: 'Todos os monitores' }
              ]
            : [{ value: 'all', label: 'Todos os monitores' }]
        }
        onChange={(value) => setAll(value === 'all')}
      />
      <WidgetInspector
        widget={values[0]}
        values={values}
        onChange={() => {}}
        onPatch={(path, value) =>
          onChange(patchWidget(draft, target, monitors, widget.id, path, value))
        }
      />
    </div>
  )
}
