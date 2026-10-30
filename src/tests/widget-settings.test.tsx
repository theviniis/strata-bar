import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import {
  configSchema,
  defaultConfig,
  widgetSchema
} from '@/services/configuration/config'
import { MonitorWidgetInspector } from '@/settings/monitor-widget-inspector'
import { WidgetInspector } from '@/settings/widget-inspector'
import { editMonitorDraft } from '@/settings/monitor-layout'
import { readNavigation } from '@/settings/navigation'

it('patches only the selected monitor without offering a scope selector', () => {
  const draft = structuredClone(defaultConfig)
  const widget = Object.values(draft.widgets)
    .flat()
    .find((w) => w.type === 'cpu')!
  draft.monitors = {
    DISPLAY2: { widgets: { [widget.id]: { intervalMs: 9000 } } }
  }
  const onChange = vi.fn()
  render(
    <MonitorWidgetInspector
      widget={widget}
      draft={draft}
      editor={editMonitorDraft(draft, 'DISPLAY1')}
      onChange={onChange}
    />
  )
  expect(
    screen.queryByLabelText('Aplicar configurações em')
  ).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Intervalo (ms)'), {
    target: { value: '5000' }
  })
  const next = onChange.mock.calls[0][0]
  expect(next.monitors.DISPLAY1.widgets[widget.id].intervalMs).toBe(5000)
  expect(next.monitors.DISPLAY2).toEqual(draft.monitors.DISPLAY2)
  expect(next.widgets).toEqual(draft.widgets)
})

it.each(['mediaSpectrum', 'music', 'volume', 'microphone', 'agents'] as const)(
  'hides unsupported format choices for %s',
  (type) => {
    render(
      <WidgetInspector
        widget={widgetSchema.parse({ id: type, type })}
        onChange={vi.fn()}
      />
    )
    expect(screen.queryByText('Com rótulo')).not.toBeInTheDocument()
    expect(screen.queryByText('Compacto')).not.toBeInTheDocument()
  }
)

it('keeps format choices for widgets with implemented variants', () => {
  render(
    <WidgetInspector
      widget={widgetSchema.parse({ id: 'cpu', type: 'cpu' })}
      onChange={vi.fn()}
    />
  )
  expect(screen.getByText('Com rótulo')).toBeInTheDocument()
  expect(screen.getByText('Compacto')).toBeInTheDocument()
})

it('offers both formats for the active window widget and patches only the format', () => {
  const onChange = vi.fn()
  const widget = widgetSchema.parse({
    id: 'activeWindow',
    type: 'activeWindow'
  })
  const view = render(<WidgetInspector widget={widget} onChange={onChange} />)
  const label = screen.getByRole('button', { name: 'Com rótulo' })
  const compact = screen.getByRole('button', { name: 'Compacto' })
  expect(label).toHaveAttribute('aria-pressed', 'true')
  expect(compact).toHaveAttribute('aria-pressed', 'false')

  // The inspector is controlled: apply the emitted patch before asserting the inverse.
  fireEvent.click(compact)
  expect(onChange).toHaveBeenLastCalledWith({ format: 'compact' })
  view.rerender(
    <WidgetInspector
      widget={{ ...widget, format: 'compact' }}
      onChange={onChange}
    />
  )
  expect(screen.getByRole('button', { name: 'Compacto' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Com rótulo' }))
  expect(onChange).toHaveBeenLastCalledWith({ format: 'label' })
  expect(onChange).toHaveBeenCalledTimes(2)
})

it('strips the obsolete topmost setting from old documents and overrides', () => {
  const config = configSchema.parse({
    ...defaultConfig,
    bar: { ...defaultConfig.bar, alwaysOnTop: false },
    monitors: { DISPLAY1: { alwaysOnTop: false } }
  })
  expect(config.bar).not.toHaveProperty('alwaysOnTop')
  expect(config.monitors.DISPLAY1).not.toHaveProperty('alwaysOnTop')
})

it('redirects a removed settings page to Layout while retaining the monitor', () => {
  localStorage.setItem(
    'strata.settings.navigation.v1',
    JSON.stringify({
      section: 'music',
      monitor: { id: 'DISPLAY1', connected: true }
    })
  )
  expect(readNavigation()).toEqual({
    section: 'layout',
    monitor: { id: 'DISPLAY1', connected: true }
  })
  localStorage.clear()
})
