import { create } from 'zustand'
import type { ConfigSnapshot } from '@/services/system/config.generated'
import { bridge } from '@/services/system/bridge'
import {
  defaultConfig,
  parseConfig,
  parseSnapshot,
  storageKey,
  type AudioSourceConfig,
  type Config,
  type WidgetType
} from '../services/configuration/config'

type ConfigState = {
  config: Config
  error: string | null
  /** Revision of the last native snapshot; the demo store leaves it at 0. */
  revision: number
  /** Applies a text draft. Native never writes localStorage: the file is truth. */
  apply(text: string, persist?: boolean): boolean
  /** Installs a snapshot the native host published. Never falls back to demo values. */
  hydrate(snapshot: ConfigSnapshot): void
  /** Updates the `audio` routing of the first widget of a type; `undefined` clears it. */
  setWidgetAudio(type: WidgetType, audio?: AudioSourceConfig): boolean
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

/** localStorage belongs to the browser demo only; native bars read the file. */
const browser = typeof window !== 'undefined' && !window.__TAURI_INTERNALS__

export const useConfig = create<ConfigState>((set, get) => ({
  config: defaultConfig,
  error: null,
  revision: 0,
  setWidgetAudio(type, audio) {
    const { config, apply } = get()
    const next = structuredClone(config)
    for (const column of ['left', 'center', 'right'] as const) {
      const widget = next.widgets[column].find((w) => w.type === type)
      if (widget) {
        if (audio) widget.audio = audio
        else delete widget.audio
        return apply(JSON.stringify(next))
      }
    }
    return false
  },
  apply(text, persist = true) {
    try {
      const config = parseConfig(text)
      // A persisted draft is only written in the browser demo: a native bar
      // must never treat localStorage as a second source of truth. `revision`
      // is native-owned, so a local draft never blocks a later native snapshot.
      if (persist && browser)
        localStorage.setItem(storageKey, JSON.stringify(config))
      set({ config, error: null })
      return true
    } catch (e) {
      set({ error: message(e) })
      return false
    }
  },
  hydrate(snapshot) {
    try {
      const parsed = parseSnapshot(snapshot)
      // A late snapshot must never overwrite a newer one: bars order by revision.
      if (parsed.revision < get().revision) return
      set({
        config: parsed.config,
        error: parsed.error,
        revision: parsed.revision
      })
    } catch (e) {
      // Keep rendering the last good configuration; surface the rejection.
      set({ error: message(e) })
    }
  }
}))

/** The browser demo hydrates from localStorage; native hydration is async. */
export function loadConfig() {
  if (!browser) return Promise.resolve()
  try {
    const text = localStorage.getItem(storageKey)
    if (text) useConfig.getState().apply(text, false)
  } catch (e) {
    useConfig.setState({ error: message(e) })
  }
  return Promise.resolve()
}

export function watchConfig() {
  if (!browser) return () => {}
  const handler = (e: StorageEvent) => {
    if (e.key === storageKey && e.newValue)
      useConfig.getState().apply(e.newValue, false)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}

/**
 * Hydrates the native configuration and keeps it live: one `config` listener
 * per bar, scoped to that window so each bar receives its own monitor's
 * projection. Setup failure is surfaced, never replaced by demo values.
 */
export function connectConfig(): () => void {
  if (!bridge.configLoad) return () => {}
  let cancelled = false
  let stop: (() => void) | undefined
  const fail = (error: unknown) => useConfig.setState({ error: message(error) })
  void import('@tauri-apps/api/webviewWindow')
    .then(async ({ getCurrentWebviewWindow }) => {
      const current = getCurrentWebviewWindow()
      const unlisten = await current.listen<ConfigSnapshot>('config', (event) =>
        useConfig.getState().hydrate(event.payload)
      )
      if (cancelled) {
        unlisten()
        return
      }
      stop = unlisten
      useConfig.getState().hydrate(await bridge.configLoad!())
    })
    .catch(fail)
  return () => {
    if (cancelled) return
    cancelled = true
    stop?.()
  }
}
