import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { NativeBarSurface } from '@/components/status-bar/native-bar'
import {
  defaultConfig,
  widgetSchema,
  type WidgetConfig
} from '@/services/configuration/config'
import { editMonitorDraft } from '@/settings/monitor-layout'

it('mounts the enabled Agents widget in its bar section', () => {
  const renderWidget = vi.fn((_widget: WidgetConfig) => null)
  const agents = widgetSchema.parse({ id: 'agents', type: 'agents' })
  const clock = widgetSchema.parse({ id: 'clock', type: 'clock' })
  render(
    <NativeBarSurface
      bar={defaultConfig.bar}
      widgets={{ left: [agents], center: [clock], right: [] }}
      preview
      renderWidget={renderWidget}
    />
  )
  expect(renderWidget.mock.calls.map(([widget]) => widget)).toEqual([
    agents,
    clock
  ])
})

it('allows moving Agents into a monitor layout while preserving its definition', () => {
  const saved = structuredClone(defaultConfig)
  const updated = editMonitorDraft(saved, 'DISPLAY1').add('agents', {
    section: 'left',
    index: 0
  })
  expect(updated).not.toBe(saved)
  expect(editMonitorDraft(updated, 'DISPLAY1').view.widgets.left[0].type).toBe(
    'agents'
  )
  expect(saved.widgets.right.some((w) => w.type === 'agents')).toBe(true)
})
