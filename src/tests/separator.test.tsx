import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import {
  configSchema,
  defaultConfig,
  parseConfig,
  widgetSchema
} from '@/services/configuration/config'
import { NativeBarSurface } from '@/components/status-bar/NativeBar'
import { WidgetPreview } from '@/components/status-bar/WidgetPreview'
import { MonitorWidgetInspector } from '@/settings/MonitorWidgetInspector'
import { editMonitorDraft } from '@/settings/monitor-layout'
import { moveWidget } from '@/settings/layout'

it('renders only explicit enabled separators, including consecutive items', () => {
  const config = configSchema.parse({
    version: 2,
    bar: { separatorMarginX: 6 },
    widgets: {
      left: [
        { id: 'a', type: 'separator', marginX: 3 },
        { id: 'b', type: 'separator', marginX: 12 },
        { id: 'c', type: 'separator', enabled: false }
      ],
      center: [],
      right: []
    }
  })
  const { container, rerender } = render(
    <NativeBarSurface widgets={config.widgets} bar={config.bar} />
  )
  expect(container.querySelectorAll('[data-bar-separator]')).toHaveLength(2)
  for (const separator of container.querySelectorAll('[data-bar-separator]')) {
    expect(separator).toHaveStyle({ marginInline: '6px' })
  }
  rerender(
    <NativeBarSurface
      widgets={defaultConfig.widgets}
      bar={defaultConfig.bar}
      renderWidget={(widget) => <span>{widget.id}</span>}
    />
  )
  expect(container.querySelector('[data-bar-separator]')).toBeNull()
})

it('creates independent instances with one shared margin and round-trips the document', () => {
  let config = editMonitorDraft(defaultConfig, 'DISPLAY1').add('separator', {
    section: 'left',
    index: 0
  })
  config = editMonitorDraft(config, 'DISPLAY1').add('separator', {
    section: 'left',
    index: 1
  })
  config.bar.separatorMarginX = 4
  config = parseConfig(JSON.stringify(config))
  expect(editMonitorDraft(config, 'DISPLAY1').view.bar.separatorMarginX).toBe(4)
  const view = editMonitorDraft(config, 'DISPLAY1').view
  const moved = editMonitorDraft(config, 'DISPLAY1').reorder(
    moveWidget(view, 'separator-2', { section: 'center', index: 0 }).widgets
  )
  expect(editMonitorDraft(moved, 'DISPLAY1').view.widgets.center[0].id).toBe(
    'separator-2'
  )
  const removed = editMonitorDraft(moved, 'DISPLAY1').remove('separator-2')
  expect(editMonitorDraft(removed, 'DISPLAY1').view.widgets.center).toEqual(
    defaultConfig.widgets.center
  )
  expect(editMonitorDraft(removed, 'DISPLAY1').view.widgets.left[0].id).toBe(
    'separator'
  )
  expect(removed.widgets).toEqual(config.widgets)
})

it.each([-1, 33, Infinity, NaN])(
  'rejects shared margin %s',
  (separatorMarginX) => {
    expect(
      configSchema.safeParse({
        ...defaultConfig,
        bar: { ...defaultConfig.bar, separatorMarginX }
      }).success
    ).toBe(false)
  }
)

it('edits the shared margin from any separator without a monitor scope control', () => {
  const widget = widgetSchema.parse({ id: 's', type: 'separator' })
  const config = structuredClone(defaultConfig)
  config.bar.separatorMarginX = 2.5
  const onChange = vi.fn()
  const { container } = render(
    <>
      <WidgetPreview
        widget={widget}
        theme="dark"
        separatorMarginX={config.bar.separatorMarginX}
      />
      <MonitorWidgetInspector
        widget={widget}
        draft={config}
        onChange={onChange}
        editor={editMonitorDraft(config, 'DISPLAY1')}
      />
    </>
  )
  expect(container.querySelector('[data-bar-separator]')).toHaveStyle({
    marginInline: '2.5px'
  })
  expect(screen.queryByLabelText('Intervalo (ms)')).toBeNull()
  expect(screen.queryByLabelText('Aplicar configurações em')).toBeNull()
  fireEvent.change(screen.getByLabelText('Margem horizontal (px)'), {
    target: { value: '8' }
  })
  expect(onChange.mock.calls[0][0].bar.separatorMarginX).toBe(8)
})
