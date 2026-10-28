import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { WidgetInspector } from '@/settings/widget-inspector'
import { editMonitorDraft } from '@/settings/monitor-layout'
import {
  configSchema,
  defaultConfig,
  widgetSchema
} from '@/services/configuration/config'

it.each(['cpu', 'gpu'] as const)(
  'configures %s temperature independently per monitor',
  (type) => {
    const onChange = vi.fn()
    const { rerender } = render(
      <WidgetInspector
        widget={widgetSchema.parse({ id: type, type })}
        onChange={onChange}
      />
    )
    expect(screen.getByRole('button', { name: 'Uso' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    for (const [name, showUsage, showTemperature] of [
      ['Temperatura', false, true],
      ['Ambos', true, true],
      ['Uso', true, false]
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name }))
      expect(onChange).toHaveBeenLastCalledWith({ showUsage, showTemperature })
      rerender(
        <WidgetInspector
          widget={widgetSchema.parse({
            id: type,
            type,
            showUsage,
            showTemperature
          })}
          onChange={onChange}
        />
      )
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    }
    const document = configSchema.parse({
      ...defaultConfig,
      widgets: {
        left: [{ id: type, type, showTemperature: true }],
        center: [],
        right: []
      }
    })
    const changed = editMonitorDraft(document, 'DISPLAY1').updateWidget(type, {
      showUsage: false,
      showTemperature: true
    })
    const saved = configSchema.parse(JSON.parse(JSON.stringify(changed)))
    expect(
      editMonitorDraft(saved, 'DISPLAY1').view.widgets.left[0].showTemperature
    ).toBe(true)
    expect(
      editMonitorDraft(saved, 'DISPLAY1').view.widgets.left[0].showUsage
    ).toBe(false)
    expect(
      editMonitorDraft(saved, 'DISPLAY2').view.widgets.left[0].showUsage
    ).toBeUndefined()
    expect(
      editMonitorDraft(saved, 'DISPLAY2').view.widgets.left[0].showTemperature
    ).toBe(true)
  }
)
