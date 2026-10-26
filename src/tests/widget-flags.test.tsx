import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NativeBarSurface } from '@/components/status-bar/NativeBar'
import {
  defaultConfig,
  widgetSchema,
  type WidgetConfig
} from '@/services/configuration/config'
import { addableTypes, addWidget } from '@/settings/layout'
import { addToScope } from '@/settings/monitor-layout'

it('suppresses saved agents widgets on every bar section before mounting them', () => {
  const renderWidget = vi.fn((_widget: WidgetConfig) => null)
  const agents = widgetSchema.parse({ id: 'agents', type: 'agents' })
  const clock = widgetSchema.parse({ id: 'clock', type: 'clock' })
  render(
    <NativeBarSurface
      bar={defaultConfig.bar}
      widgets={{ left: [agents], center: [clock], right: [agents] }}
      preview
      renderWidget={renderWidget}
    />
  )
  expect(renderWidget.mock.calls.map(([widget]) => widget)).toEqual([clock])
})

it('blocks adding agents globally and per monitor without deleting saved settings', () => {
  expect(addableTypes()).not.toContain('agents')
  expect(addableTypes()).toContain('clock')
  const saved = structuredClone(defaultConfig)
  saved.widgets.right.push(widgetSchema.parse({ id: 'agents', type: 'agents' }))
  expect(addWidget(saved, 'agents', 'right')).toBe(saved)
  expect(
    addToScope(saved, 'DISPLAY1', [], 'agents', {
      section: 'right',
      index: 0
    })
  ).toBe(saved)
  expect(saved.widgets.right.some((w) => w.type === 'agents')).toBe(true)
})
