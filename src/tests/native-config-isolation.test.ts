import { afterEach, expect, it, vi } from 'vitest'
import { defaultConfig, storageKey } from '../services/configuration/config'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  localStorage.clear()
})

it('ignores browser persistence and storage events in a native window', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.resetModules()
  const { useConfig, loadConfig, watchConfig } =
    await import('../stores/config')
  const browserConfig = structuredClone(defaultConfig)
  browserConfig.bar.theme = 'light'
  const text = JSON.stringify(browserConfig)
  localStorage.setItem(storageKey, text)

  const nativeConfig = structuredClone(defaultConfig)
  nativeConfig.bar.theme = 'dark'
  useConfig
    .getState()
    .hydrate({ revision: 7, config: nativeConfig, error: null })
  await loadConfig()
  const stop = watchConfig()
  window.dispatchEvent(
    new StorageEvent('storage', { key: storageKey, newValue: text })
  )

  expect(useConfig.getState().config).toEqual(nativeConfig)
  expect(useConfig.getState().revision).toBe(7)
  expect(localStorage.getItem(storageKey)).toBe(text)
  stop()
})
