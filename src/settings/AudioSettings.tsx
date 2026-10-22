import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { FieldGroup } from '@/components/ui/field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { Config } from '@/services/configuration/config'
import { normalizeMonitorName } from '@/services/configuration/config'
import { allWidgets } from './layout'
import { effectiveWidget, patchWidget } from './monitor-layout'
import { AudioInspectorFields } from './AudioInspectorFields'
import { Choice } from './WidgetInspector'
import { useMonitors } from './useMonitors'

export function AudioSettings({
  type,
  draft,
  onChange
}: {
  type: 'volume' | 'microphone'
  draft: Config
  onChange(next: Config): void
}) {
  const { monitors, error, refresh } = useMonitors()
  const [scope, setScope] = useState('all')
  const [selected, setSelected] = useState('')
  const widgets = allWidgets(draft).filter((widget) => widget.type === type)
  const widget = widgets.find((widget) => widget.id === selected) ?? widgets[0]
  const title = type === 'volume' ? 'Saída de áudio' : 'Entrada de áudio'
  // Include saved overrides even when their monitor is disconnected.
  const scopes = [
    ...new Set([
      ...monitors.map((monitor) => monitor.id),
      ...Object.keys(draft.monitors)
    ])
  ]
  const target = scope === 'all' ? null : scope
  const values = widget
    ? (target ? [target] : [null, ...scopes]).map((monitor) =>
        effectiveWidget(draft, widget.id, monitor)
      )
    : []
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          {title}
        </CardTitle>
        <CardDescription>
          O roteamento é global por canal e compartilhado entre todas as barras:
          a última configuração enviada por uma barra prevalece. As opções por
          monitor e instância são preservadas; elas não criam roteamentos
          independentes. As alterações só entram em vigor após Aplicar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>
                {error}
                <Button onClick={refresh}>Tentar novamente</Button>
              </AlertDescription>
            </Alert>
          )}
          <Choice
            label="Aplicar configurações em"
            value={scope}
            options={[
              { value: 'all', label: 'Todos os monitores' },
              ...scopes.map((id) => ({
                value: id,
                label:
                  monitors.find(
                    (monitor) =>
                      normalizeMonitorName(monitor.id) ===
                      normalizeMonitorName(id)
                  )?.name ?? id
              }))
            ]}
            onChange={setScope}
          />
          {widget ? (
            <>
              <Choice
                label="Instância do widget"
                value={widget.id}
                options={widgets.map((widget) => ({
                  value: widget.id,
                  label: widget.id
                }))}
                onChange={setSelected}
              />
              <AudioInspectorFields
                widget={values[0]}
                values={values}
                onPatch={(path, value) => {
                  // Patch leaves in each scope so different labels and retained targets survive.
                  let next = patchWidget(
                    draft,
                    target,
                    [],
                    widget.id,
                    path,
                    value
                  )
                  if (!target)
                    for (const monitor of scopes)
                      next = patchWidget(
                        next,
                        monitor,
                        [],
                        widget.id,
                        path,
                        value
                      )
                  onChange(next)
                }}
              />
            </>
          ) : (
            <p>
              Adicione este widget em Layout para configurar suas preferências.
            </p>
          )}
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
