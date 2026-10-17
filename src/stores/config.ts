import { create } from 'zustand'
import {
  defaultConfig,
  parseConfig,
  storageKey,
  type Config
} from '../services/configuration/config'

type ConfigState = {
  config: Config
  error: string | null
  apply(text: string, persist?: boolean): boolean
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const useConfig = create<ConfigState>((set) => ({
  config: defaultConfig,
  error: null,
  apply(text, persist = true) {
    try {
      const config = parseConfig(text)
      if (persist) localStorage.setItem(storageKey, JSON.stringify(config))
      set({ config, error: null })
      return true
    } catch (e) {
      set({ error: message(e) })
      return false
    }
  }
}))

export function loadConfig() {
  try {
    const text = localStorage.getItem(storageKey)
    if (text) useConfig.getState().apply(text, false)
  } catch (e) {
    useConfig.setState({ error: message(e) })
  }
}

export function watchConfig() {
  const handler = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue)
      useConfig.getState().apply(e.newValue, false)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
