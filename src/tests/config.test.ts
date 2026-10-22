import { describe, it, expect, beforeEach } from 'vitest'
import {
  defaultConfig,
  parseConfig,
  voicemeeterLabel,
  widgetAudio
} from '../services/configuration/config'
import { useConfig } from '../stores/config'

describe('configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    useConfig.setState({ config: defaultConfig, error: null })
  })
  it('uses the system theme by default and preserves explicit choices', () => {
    expect(defaultConfig.bar.theme).toBe('system')
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
    expect(parseConfig(JSON.stringify(defaultConfig)).bar.height).toBe(36))
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
    expect(useConfig.getState().config.bar.height).toBe(36)
  })
  it('persists valid changes', () => {
    const c = structuredClone(defaultConfig)
    c.bar.position = 'bottom'
    expect(useConfig.getState().apply(JSON.stringify(c))).toBe(true)
    expect(localStorage.getItem('strata.config.v1')).toContain('bottom')
  })
  it('records and clears the widget audio routing', () => {
    const settings = useConfig.getState()
    expect(
      settings.setWidgetAudio('volume', {
        source: 'voicemeeter',
        target: { kind: 'bus', index: 0 },
        label: 'A1 · ASIO4ALL v2'
      })
    ).toBe(true)
    expect(widgetAudio(useConfig.getState().config, 'volume')).toMatchObject({
      source: 'voicemeeter'
    })
    const persisted = JSON.parse(localStorage.getItem('strata.config.v1')!) as {
      widgets: { right: Array<{ type: string; audio?: unknown }> }
    }
    const widget = persisted.widgets.right.find((w) => w.type === 'volume')!
    expect(widget).toHaveProperty('audio')

    expect(settings.setWidgetAudio('volume', undefined)).toBe(true)
    expect(widgetAudio(useConfig.getState().config, 'volume')).toBeUndefined()
    const persisted2 = JSON.parse(
      localStorage.getItem('strata.config.v1')!
    ) as {
      widgets: { right: Array<{ type: string; audio?: unknown }> }
    }
    const cleared = persisted2.widgets.right.find((w) => w.type === 'volume')!
    expect('audio' in cleared).toBe(false)
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
