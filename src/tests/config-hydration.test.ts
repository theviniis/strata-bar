import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultConfig,
  parseConfig,
  storageKey
} from '../services/configuration/config'
import { useConfig } from '../stores/config'

function snapshot(
  config = defaultConfig,
  revision = 1,
  error: string | null = null
) {
  return { revision, config, error }
}

describe('native configuration hydration', () => {
  beforeEach(() => {
    localStorage.clear()
    useConfig.setState({ config: defaultConfig, error: null, revision: 0 })
  })

  it('installs the document the native store published', () => {
    const edited = parseConfig(
      JSON.stringify({
        version: 1,
        bar: { theme: 'light', spacing: 16 },
        widgets: {
          left: [],
          center: [{ id: 'time', type: 'clock' }],
          right: []
        }
      })
    )
    useConfig.getState().hydrate(snapshot(edited, 4))
    expect(useConfig.getState().config).toEqual(edited)
    expect(useConfig.getState().revision).toBe(4)
    expect(useConfig.getState().error).toBeNull()
  })

  it('never lets a stale snapshot overwrite a newer one', () => {
    const first = structuredClone(defaultConfig)
    first.bar.spacing = 12
    useConfig.getState().hydrate(snapshot(first, 5))
    const stale = structuredClone(defaultConfig)
    stale.bar.spacing = 2
    useConfig.getState().hydrate(snapshot(stale, 4))
    expect(useConfig.getState().config.bar.spacing).toBe(12)
    expect(useConfig.getState().revision).toBe(5)
  })

  it('keeps the last good document and the rejection reason beside it', () => {
    const good = structuredClone(defaultConfig)
    good.bar.spacing = 10
    useConfig.getState().hydrate(snapshot(good, 2))
    // A corrupt hand edit: the store republishes the last good document plus why.
    useConfig
      .getState()
      .hydrate(snapshot(good, 2, 'Invalid config: expected value at line 1'))
    expect(useConfig.getState().config).toEqual(good)
    expect(useConfig.getState().error).toContain('Invalid config')
    // The next accepted document clears the reason.
    useConfig.getState().hydrate(snapshot(defaultConfig, 3))
    expect(useConfig.getState().error).toBeNull()
  })

  it('rejects a wire payload that fails runtime validation without a demo fallback', () => {
    const good = structuredClone(defaultConfig)
    good.bar.spacing = 10
    useConfig.getState().hydrate(snapshot(good, 2))
    const broken = structuredClone(defaultConfig) as unknown as {
      bar: { height: number }
    }
    broken.bar.height = 12
    useConfig
      .getState()
      .hydrate(snapshot(broken as unknown as typeof defaultConfig, 3))
    // The invalid document is never rendered, and the bar is not reset to the
    // shipped defaults either: it keeps what it had.
    expect(useConfig.getState().config).toEqual(good)
    expect(useConfig.getState().error).toBeTruthy()
  })

  it('does not write localStorage from a native hydration', () => {
    const edited = structuredClone(defaultConfig)
    edited.bar.theme = 'light'
    useConfig.getState().hydrate(snapshot(edited, 1))
    expect(localStorage.getItem(storageKey)).toBeNull()
  })
})
