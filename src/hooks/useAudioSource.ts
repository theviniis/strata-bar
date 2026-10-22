import { useEffect } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import type { AudioSourceConfig } from '../services/configuration/config'
import {
  bridge,
  type AudioChannel,
  type VmTarget
} from '../services/system/bridge'

/**
 * Pushes the widget's configured audio routing to the native worker. The
 * routing is global per channel (last write wins), so every widget of a channel
 * must send its own config whenever the configuration changes.
 */
export function useAudioSource(
  channel: AudioChannel,
  audio?: AudioSourceConfig
) {
  const preview = useWidgetPreview()
  const disabled = audio?.enabled === false
  const target: VmTarget | null =
    !disabled && audio?.source === 'voicemeeter' && audio.target
      ? { kind: audio.target.kind, index: audio.target.index }
      : null
  useEffect(
    () => {
      if (preview) return
      void bridge.setChannelSource?.(channel, target)
    },
    // The native routing keys on kind/index only; unrelated config edits must
    // not rewrite the mapping the worker already applied.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [channel, target?.kind, target?.index, disabled, preview]
  )
}
