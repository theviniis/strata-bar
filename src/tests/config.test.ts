import { describe, it, expect, beforeEach } from 'vitest'
import { defaultConfig, parseConfig } from '../services/configuration/config'
import { useConfig } from '../stores/config'

describe('configuration', () => {
  beforeEach(() => {
    localStorage.clear()
    useConfig.setState({ config: defaultConfig, error: null })
  })
  it('normalizes defaults', () =>
    expect(parseConfig(JSON.stringify(defaultConfig)).bar.height).toBe(36))
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
})
