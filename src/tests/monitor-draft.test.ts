import { expect, it } from 'vitest'
import { configSchema } from '@/services/configuration/config'
import { editMonitorDraft } from '@/settings/monitor-layout'

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
    let next = editor.move('cpu', { section: 'right', index: 0 })
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

it.each(['pointer', 'keyboard'] as const)(
  'commits a %s move without changing Widget settings or Default layout',
  (input) => {
    const original = initialDraft()
    const before = structuredClone(original)
    const editor = editMonitorDraft(original, 'DISPLAY2')
    let move = editor.beginMove('cpu')
    if (input === 'pointer') move = move.preview('section:right', false)
    expect(original).toEqual(before)
    const next = move.drop(editor, 'section:right', input)!
    expect(configSchema.parse(next)).toEqual(next)
    expect(editMonitorDraft(next, 'DISPLAY2').view.widgets.right).toEqual([
      expect.objectContaining({ id: 'cpu', intervalMs: 9000 })
    ])
    expect(next.widgets).toEqual(original.widgets)
    expect(next.layout).toEqual(original.layout)
    expect(next.monitors.DISPLAY2.widgets).toEqual(
      original.monitors.DISPLAY2.widgets
    )
    expect(next.monitors.offline).toEqual(original.monitors.offline)
    expect(editMonitorDraft(next, 'future-monitor').view.widgets).toEqual(
      original.widgets
    )
    expect(original).toEqual(before)
  }
)

it.each(['pointer', 'keyboard'] as const)(
  'keeps catalog identities temporary across repeated %s separator additions',
  (input) => {
    const original = initialDraft()
    let next = original
    for (let index = 0; index < 2; index += 1) {
      const editor = editMonitorDraft(next, 'DISPLAY2')
      let move = editor.beginMove('catalog:separator')
      expect(move.widget?.id).toBe('preview:catalog:separator')
      if (input === 'pointer') move = move.preview('section:left', false)
      next = move.drop(editor, 'section:left', input)!
      expect(configSchema.parse(next)).toEqual(next)
    }
    expect(
      editMonitorDraft(next, 'DISPLAY2').view.widgets.left.map((w) => w.id)
    ).toEqual(['cpu', 'separator', 'separator-2'])
    expect(JSON.stringify(next)).not.toContain('preview:')
    expect(editMonitorDraft(next, 'future-monitor').view.widgets).toEqual(
      original.widgets
    )
    expect(next.monitors.DISPLAY2.widgets).toEqual(
      original.monitors.DISPLAY2.widgets
    )
  }
)

it.each(['pointer', 'keyboard'] as const)(
  'restores retained settings when a removed widget returns through a %s catalog move',
  (input) => {
    const original = initialDraft()
    const removed = editMonitorDraft(original, 'DISPLAY2').remove('cpu')
    const editor = editMonitorDraft(removed, 'DISPLAY2')
    let move = editor.beginMove('catalog:cpu')
    if (input === 'pointer') move = move.preview('section:center', false)
    const restored = move.drop(editor, 'section:center', input)!
    expect(
      editMonitorDraft(restored, 'DISPLAY2').view.widgets.center[1]
    ).toMatchObject({
      id: 'cpu',
      intervalMs: 9000
    })
    expect(restored.widgets).toEqual(original.widgets)
    expect(restored.monitors.DISPLAY2.widgets).toEqual(
      original.monitors.DISPLAY2.widgets
    )
  }
)

it('discards a moved or catalog preview on an outside drop without mutating the Draft', () => {
  const original = initialDraft()
  const before = structuredClone(original)
  const editor = editMonitorDraft(original, 'DISPLAY2')
  for (const id of ['cpu', 'catalog:separator']) {
    const move = editor.beginMove(id).preview('section:center', false)
    expect(move.drop(editor, null, 'pointer')).toBeUndefined()
    expect(editor.view.widgets).toEqual(
      editMonitorDraft(original, 'DISPLAY2').view.widgets
    )
  }
  expect(original).toEqual(before)
})

it('keeps repeated same-column previews stable around an insertion point', () => {
  const original = initialDraft()
  original.widgets.left.push(original.widgets.center.pop()!)
  original.widgets.left.push({ ...original.widgets.left[0], id: 'cpu-2' })
  const editor = editMonitorDraft(original, 'DISPLAY2')
  const move = editor.beginMove('cpu').preview('clock', true)
  expect(move.view.widgets.left.map((w) => w.id)).toEqual([
    'clock',
    'cpu',
    'cpu-2'
  ])
  expect(move.preview('clock', true)).toBe(move)
  expect(
    move.drop(editor, 'clock', 'pointer')?.monitors.DISPLAY2.layout?.left
  ).toEqual(['clock', 'cpu', 'cpu-2'])
})

it.each(['pointer', 'keyboard'] as const)(
  'preserves newer canonical settings when a %s preview is committed',
  (input) => {
    const original = initialDraft()
    const editor = editMonitorDraft(original, 'DISPLAY2')
    let move = editor.beginMove('cpu')
    if (input === 'pointer') move = move.preview('section:right', false)
    const updated = editor.updateWidget('cpu', { tooltip: false })
    updated.bar.separatorMarginX = 8
    const next = move.drop(
      editMonitorDraft(updated, 'DISPLAY2'),
      'section:right',
      input
    )!
    expect(configSchema.parse(next)).toEqual(next)
    expect(next.bar.separatorMarginX).toBe(8)
    expect(
      editMonitorDraft(next, 'DISPLAY2').view.widgets.right[0]
    ).toMatchObject({
      id: 'cpu',
      intervalMs: 9000,
      tooltip: false
    })
    expect(next.widgets).toEqual(original.widgets)
  }
)
