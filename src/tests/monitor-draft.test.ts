import { expect, it } from 'vitest'
import { configSchema } from '@/services/configuration/config'
import { editMonitorDraft } from '@/settings/monitor-layout'
import { moveWidget } from '@/settings/layout'

function initialDraft() {
  return configSchema.parse({
    version: 2,
    bar: {},
    widgets: {
      left: [{ id: 'cpu', type: 'cpu' }],
      center: [{ id: 'clock', type: 'clock' }],
      right: []
    },
    monitors: {
      DISPLAY2: { widgets: { cpu: { intervalMs: 9000 } } },
      offline: { layout: { left: [], center: ['clock'], right: ['cpu'] } }
    }
  })
}

it.each([false, true])(
  'edits one monitor while preserving inherited defaults (explicit layout: %s)',
  (explicit) => {
    const original = initialDraft()
    if (explicit)
      original.layout = { left: ['cpu'], center: ['clock'], right: [] }
    const before = structuredClone(original)
    let editor = editMonitorDraft(original, 'DISPLAY1')
    let next = editor.reorder(
      moveWidget(editor.view, 'cpu', { section: 'right', index: 0 }).widgets
    )
    editor = editMonitorDraft(next, 'DISPLAY1')
    next = editor.updateWidget('cpu', { intervalMs: 5000, tooltip: false })
    next = editMonitorDraft(next, 'DISPLAY1').setEnabled(false)

    expect(configSchema.parse(next)).toEqual(next)
    const selected = editMonitorDraft(next, 'DISPLAY1')
    expect(selected.view.widgets.right[0]).toMatchObject({
      id: 'cpu',
      intervalMs: 5000,
      tooltip: false
    })
    expect(selected.enabled).toBe(false)
    expect(next.widgets).toEqual(before.widgets)
    expect(next.layout).toEqual(before.layout)
    expect(next.bar).toEqual(before.bar)
    expect(next.monitors.DISPLAY2).toEqual(before.monitors.DISPLAY2)
    expect(next.monitors.offline).toEqual(before.monitors.offline)
    expect(editMonitorDraft(next, 'new-monitor').view.widgets).toEqual(
      before.widgets
    )
    expect(original).toEqual(before)
  }
)

it('restores a removed widget with its monitor settings and original identity', () => {
  const original = initialDraft()
  const removed = editMonitorDraft(original, 'DISPLAY2').remove('cpu')
  expect(editMonitorDraft(removed, 'DISPLAY2').view.widgets.left).toEqual([])
  expect(removed.monitors.DISPLAY2.widgets).toEqual(
    original.monitors.DISPLAY2.widgets
  )
  expect(removed.widgets).toEqual(original.widgets)
  const restored = editMonitorDraft(removed, 'DISPLAY2').add('cpu', {
    section: 'right',
    index: 0
  })
  expect(
    editMonitorDraft(restored, 'DISPLAY2').view.widgets.right[0]
  ).toMatchObject({
    id: 'cpu',
    intervalMs: 9000
  })
  expect(restored.widgets).toEqual(original.widgets)
  expect(configSchema.parse(restored)).toEqual(restored)
})

it('adds new definitions only to the selected layout, preserving future monitor defaults', () => {
  const original = initialDraft()
  let next = editMonitorDraft(original, 'offline').add('volume', {
    section: 'right',
    index: 1
  })
  next = editMonitorDraft(next, 'offline').add('separator', {
    section: 'right',
    index: 1
  })
  next = editMonitorDraft(next, 'offline').add('separator', {
    section: 'right',
    index: 2
  })
  expect(
    editMonitorDraft(next, 'offline').view.widgets.right.map((w) => w.id)
  ).toEqual(['cpu', 'separator', 'separator-2', 'volume'])
  expect(editMonitorDraft(next, 'new-monitor').view.widgets).toEqual(
    original.widgets
  )
  expect(editMonitorDraft(next, 'DISPLAY2').view.widgets).toEqual(
    editMonitorDraft(original, 'DISPLAY2').view.widgets
  )
  expect(next.monitors.DISPLAY2).toEqual(original.monitors.DISPLAY2)
  expect(configSchema.parse(next)).toEqual(next)
})

it('resolves monitor aliases without creating a second override or freezing unrelated fields', () => {
  const original = initialDraft()
  const next = editMonitorDraft(original, ' display2 ').updateWidget('cpu', {
    tooltip: false
  })
  expect(Object.keys(next.monitors)).toEqual(Object.keys(original.monitors))
  expect(next.monitors.DISPLAY2.widgets!.cpu).toEqual({
    intervalMs: 9000,
    tooltip: false
  })
  expect(next.widgets).toEqual(original.widgets)
  expect(() => editMonitorDraft(original, '')).toThrow('Selecione um monitor')
})
