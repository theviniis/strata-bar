import { create } from 'zustand'
import type { AgentType } from '@/services/system/agents.generated'
import {
  defaultConfig,
  parseConfig,
  storageKey,
  type AudioSourceConfig,
  type Config,
  type WidgetType
} from '../services/configuration/config'

type ConfigState = {
  config: Config
  error: string | null
  apply(text: string, persist?: boolean): boolean
  setAgentVisible(agent: AgentType, visible: boolean): boolean
  /** Updates the `audio` routing of the first widget of a type; `undefined` clears it. */
  setWidgetAudio(type: WidgetType, audio?: AudioSourceConfig): boolean
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const useConfig = create<ConfigState>((set, get) => ({
  config: defaultConfig,
  error: null,
  setAgentVisible(agent, visible) {
    const { config, apply } = get()
    return apply(
      JSON.stringify({
        ...config,
        agents: {
          ...config.agents,
          visible: { ...config.agents.visible, [agent]: visible }
        }
      })
    )
  },
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
