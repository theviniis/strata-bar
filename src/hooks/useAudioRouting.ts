import { useEffect } from 'react'
import type { Config } from '@/services/configuration/config'
import { useConfig } from '@/stores/config'
import {
  bridge,
  type AudioChannel,
  type VmTarget
} from '@/services/system/bridge'

/** Every bar sends the same two global routes, independent of its widget layout. */
export function useAudioRouting(audio: Config['audio']) {
  useEffect(() => {
    const routes: [AudioChannel, VmTarget | null][] = [
      [
        'volume',
        audio.output.source === 'voicemeeter'
          ? { kind: 'bus', index: audio.output.targetIndex }
          : null
      ],
      [
        'microphone',
        audio.input.source === 'voicemeeter'
          ? { kind: 'strip', index: audio.input.targetIndex }
          : null
      ]
    ]
    for (const [channel, target] of routes)
      void bridge.setChannelSource?.(channel, target).catch((error) => {
        useConfig.setState({
          error: error instanceof Error ? error.message : String(error)
        })
      })
  }, [audio])
}
