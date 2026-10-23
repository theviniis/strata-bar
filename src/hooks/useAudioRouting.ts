import { useEffect } from 'react'
import type { Config } from '@/services/configuration/config'
import { useConfig } from '@/stores/config'
import {
  bridge,
  type AudioChannel,
  type VmTarget
} from '@/services/system/bridge'

/**
 * Pushes audio routing for all volume/microphone widgets in the given widget
 * arrays to the native worker. Called by the bar on mount and on config changes
 * so that routing takes effect even for widgets that are not currently rendered
 * (e.g. disabled widgets that may be enabled later). The worker owns the
 * last-write-wins semantics per channel.
 */
export function useAudioRouting({ left, center, right }: Config['widgets']) {
  useEffect(() => {
    const allWidgets = [...left, ...center, ...right]
    const routes = new Map<AudioChannel, VmTarget | null>()
    for (const widget of allWidgets) {
      if (widget.type !== 'volume' && widget.type !== 'microphone') continue
      const audio = widget.audio
      const disabled = audio?.enabled === false
      const target: VmTarget | null =
        !disabled && audio?.source === 'voicemeeter' && audio.target
          ? { kind: audio.target.kind, index: audio.target.index }
          : null
      routes.set(widget.type, target)
    }
    for (const [channel, target] of routes) {
      void bridge.setChannelSource?.(channel, target).catch((error) => {
        useConfig.setState({
          error: error instanceof Error ? error.message : String(error)
        })
      })
    }
  }, [left, center, right])
}
