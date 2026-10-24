import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultConfig,
  parseConfig,
  voicemeeterLabel,
  widgetAudio
} from '../services/configuration/config'
import { useConfig } from '../stores/config'
import { cornerRadius } from '../components/status-bar/curves'

describe('configuration', () => {
  it('preserves automatic curves and accepts a bounded custom radius', () => {
    expect(cornerRadius(defaultConfig.bar)).toBe(16.5)
    for (const radius of [0, 8.5, 40]) {
      const parsed = parseConfig(
        JSON.stringify({
          ...defaultConfig,
          bar: { ...defaultConfig.bar, cornerRadius: radius },
          monitors: { DISPLAY2: { cornerRadius: radius } }
        })
      )
      expect(parsed.bar.cornerRadius).toBe(radius)
      expect(parsed.monitors.DISPLAY2.cornerRadius).toBe(radius)
      expect(cornerRadius(parsed.bar)).toBe(Math.min(radius, 16.5))
    }
    for (const cornerRadius of [-1, 41]) {
      expect(() =>
        parseConfig(
          JSON.stringify({
            ...defaultConfig,
            bar: { ...defaultConfig.bar, cornerRadius }
          })
        )
      ).toThrow()
      expect(() =>
        parseConfig(
          JSON.stringify({
            ...defaultConfig,
            monitors: { DISPLAY2: { cornerRadius } }
          })
        )
      ).toThrow()
    }
  })
  beforeEach(() => {
    localStorage.clear()
    useConfig.setState({ config: defaultConfig, error: null })
  })
  it('uses the dark installation theme by default and preserves explicit choices', () => {
    expect(defaultConfig.bar.theme).toBe('dark')
    for (const theme of ['system', 'dark', 'light']) {
      expect(
        parseConfig(JSON.stringify({ ...defaultConfig, bar: { theme } })).bar
          .theme
      ).toBe(theme)
    }
    expect(
      parseConfig(JSON.stringify({ ...defaultConfig, bar: {} })).bar.theme
    ).toBe('system')
  })
  it('normalizes defaults', () =>
    expect(parseConfig(JSON.stringify(defaultConfig)).bar.height).toBe(33))
  it('accepts the document the native store writes unchanged', () => {
    // `defaults()` in the Rust store writes this shape (the version literally
    // included); the runtime validator must accept it without altering it, so
    // the two definitions fail loudly when they drift.
    const native = JSON.parse(JSON.stringify(defaultConfig))
    expect(parseConfig(JSON.stringify(native))).toEqual(defaultConfig)
    expect(native.version).toBe(1)
  })
  it('keeps the schema pointer a hand edit added', () => {
    // Editors read `$schema` for completion and range errors. A parse must not
    // drop it, or the first save silences the author's editor.
    const url =
      'https://raw.githubusercontent.com/theviniis/strata-bar/main/config.schema.json'
    const parsed = parseConfig(
      JSON.stringify({ ...defaultConfig, $schema: url })
    )
    expect(parsed.$schema).toBe(url)
    expect(JSON.parse(JSON.stringify(parsed)).$schema).toBe(url)
  })
  it('accepts a document without the schema pointer', () => {
    const { $schema: _omitted, ...rest } = defaultConfig
    expect(parseConfig(JSON.stringify(rest)).$schema).toBeUndefined()
  })
  it('ships the komorebi workspace widget in the default layout', () => {
    const widget = defaultConfig.widgets.left.find((w) => w.type === 'komorebi')
    expect(widget).toBeDefined()
    expect(parseConfig(JSON.stringify(defaultConfig)).widgets.left).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'komorebi' })])
    )
  })
  it('rejects duplicate widget identifiers', () => {
    const c = structuredClone(defaultConfig)
    c.widgets.right[0].id = 'time'
    expect(() => parseConfig(JSON.stringify(c))).toThrow(/unique/)
  })
  it('preserves last good configuration on malformed or out-of-range edits', () => {
    expect(useConfig.getState().apply('{')).toBe(false)
    expect(useConfig.getState().config).toBe(defaultConfig)
    const c = structuredClone(defaultConfig)
    c.bar.height = 900
    expect(useConfig.getState().apply(JSON.stringify(c))).toBe(false)
    expect(useConfig.getState().config.bar.height).toBe(33)
  })
  it('persists valid changes', () => {
    const c = structuredClone(defaultConfig)
    c.bar.position = 'bottom'
    expect(useConfig.getState().apply(JSON.stringify(c))).toBe(true)
    expect(localStorage.getItem('strata.config.v1')).toContain('bottom')
  })
  it('defaults audio widgets to the Windows endpoints', () => {
    const parsed = parseConfig(JSON.stringify(defaultConfig))
    expect(widgetAudio(parsed, 'volume')).toBeUndefined()
    expect(widgetAudio(parsed, 'microphone')).toBeUndefined()
  })
  it('routes an audio widget to Voicemeeter only with a strip/bus target', () => {
    const c = structuredClone(defaultConfig)
    c.widgets.right.find((w) => w.type === 'volume')!.audio = {
      source: 'voicemeeter',
      target: { kind: 'bus', index: 0 },
      label: 'A1 fones'
    }
    const parsed = parseConfig(JSON.stringify(c))
    const audio = widgetAudio(parsed, 'volume')!
    expect(audio.source).toBe('voicemeeter')
    expect(voicemeeterLabel(audio)).toBe('A1 fones')
    expect(
      voicemeeterLabel({
        source: 'voicemeeter',
        target: { kind: 'bus', index: 0 }
      })
    ).toBe('Bus 0')
    expect(() =>
      parseConfig(
        JSON.stringify(
          Object.assign(structuredClone(defaultConfig), {
            widgets: {
              left: [],
              center: [],
              right: [
                {
                  id: 'volume',
                  type: 'volume',
                  audio: { source: 'voicemeeter' }
                }
              ]
            }
          })
        )
      )
    ).toThrow(/target/)
  })
})

it('adds microphone after volume only in new configurations', () => {
  const right = defaultConfig.widgets.right
  expect(right[right.findIndex((w) => w.type === 'volume') + 1]).toMatchObject({
    type: 'microphone',
    enabled: true
  })
  const legacy = structuredClone(defaultConfig)
  legacy.widgets.right = legacy.widgets.right.filter(
    (w) => w.type !== 'microphone'
  )
  expect(parseConfig(JSON.stringify(legacy))).toEqual(legacy)
})

it('ships the installation layout without machine-specific routing or monitors', () => {
  const ids = (section: keyof typeof defaultConfig.widgets) =>
    defaultConfig.widgets[section].map((widget) => widget.id)
  expect(ids('left')).toEqual(['workspaces'])
  expect(ids('center')).toEqual(['cpu', 'gpu', 'memory', 'disk'])
  expect(ids('right')).toEqual([
    'music',
    'separator-4',
    'volume',
    'microphone',
    'separator-5',
    'reminders',
    'separator-3',
    'time'
  ])
  expect(defaultConfig.bar).toMatchObject({
    height: 33,
    spacing: 2,
    theme: 'dark'
  })
  expect(defaultConfig.monitors).toEqual({})
  expect(
    Object.values(defaultConfig.widgets)
      .flat()
      .every((w) => !w.audio)
  ).toBe(true)
})
