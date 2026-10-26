import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultConfig,
  parseConfig,
  configSchema
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
    expect(native.version).toBe(2)
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
  it('ships the workspaces widget in the default layout', () => {
    const widget = defaultConfig.widgets.left.find(
      (w) => w.type === 'workspaces'
    )
    expect(widget).toBeDefined()
    expect(parseConfig(JSON.stringify(defaultConfig)).widgets.left).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'workspaces' })])
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
  it('defaults both global channels to Windows and validates their indices', () => {
    expect(defaultConfig.audio).toEqual({
      output: { source: 'windows', targetIndex: 0 },
      input: { source: 'windows', targetIndex: 0 }
    })
    for (const channel of ['output', 'input'] as const) {
      for (const targetIndex of [-1, 8, 0.5]) {
        const config = structuredClone(defaultConfig)
        config.audio[channel] = { source: 'voicemeeter', targetIndex }
        expect(() => configSchema.parse(config)).toThrow()
      }
    }
  })
  it('migrates conflicting legacy audio without changing other preferences', () => {
    const legacy = JSON.parse(JSON.stringify(defaultConfig))
    legacy.version = 1
    delete legacy.audio
    legacy.widgets.right[2].audio = {
      source: 'voicemeeter',
      target: { kind: 'strip', index: 3 },
      label: 'Old',
      enabled: false
    }
    legacy.monitors = {
      DISPLAY2: {
        widgets: {
          volume: {
            tooltip: false,
            audio: { source: 'voicemeeter', target: { kind: 'bus', index: 7 } }
          }
        }
      }
    }
    const migrated = parseConfig(JSON.stringify(legacy))
    expect(migrated.version).toBe(2)
    expect(migrated.audio).toEqual(defaultConfig.audio)
    expect(migrated.widgets).toEqual(defaultConfig.widgets)
    expect(migrated.monitors).toEqual({
      DISPLAY2: { widgets: { volume: { tooltip: false } } }
    })
    expect(legacy.widgets.right[2].audio.label).toBe('Old')
    expect(parseConfig(JSON.stringify(migrated))).toEqual(migrated)
  })
  it('rejects legacy audio fields and per-widget overrides in version 2', () => {
    for (const field of ['label', 'kind', 'enabled', 'target']) {
      const config = JSON.parse(JSON.stringify(defaultConfig))
      config.audio.output[field] = 'legacy'
      expect(() => parseConfig(JSON.stringify(config))).toThrow()
    }
    const config = JSON.parse(JSON.stringify(defaultConfig))
    config.widgets.right[2].audio = { source: 'windows' }
    expect(() => parseConfig(JSON.stringify(config))).toThrow()
    delete config.widgets.right[2].audio
    config.monitors = {
      DISPLAY2: { widgets: { volume: { audio: { source: 'windows' } } } }
    }
    expect(() => parseConfig(JSON.stringify(config))).toThrow()
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
      .every((w) => !('audio' in w))
  ).toBe(true)
})
