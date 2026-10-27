import { useEffect, useRef, useState } from 'react'
import type {
  ChannelData,
  SystemEvent,
  VolumeChange
} from '@/services/system/bridge'
import { useConfig } from '@/stores/config'
import { useAudioControl } from './use-audio-control'

type Devices = ChannelData['audioOutputs']
type Volume = ChannelData['volume']

/** Owns endpoint selection and the gain/mute lifetime for either audio direction. */
export function useAudioSelection({
  direction,
  devices,
  volume,
  selectDevice,
  writeVolume
}: {
  direction: 'input' | 'output'
  devices: SystemEvent<Devices>
  volume: SystemEvent<Volume>
  selectDevice(value: { deviceId: string }): Promise<Devices>
  writeVolume(value: VolumeChange): Promise<Volume>
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<{
    base: typeof devices
    data: Devices
  } | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const data =
    (confirmed?.base === devices ? confirmed.data : null) ??
    (devices.status === 'ready' ? devices.data : null)
  async function select(id: string) {
    if (busy.current || !mounted.current) return
    busy.current = true
    setPending(id)
    setError('')
    try {
      const result = await selectDevice({ deviceId: id })
      // A newer observation supersedes this command's confirmation.
      if (mounted.current) setConfirmed({ base: devices, data: result })
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }
  const route = useConfig((state) => state.config.audio[direction])
  // Endpoint selection always targets Windows; gain/mute may target Voicemeeter.
  const routeKey = JSON.stringify([
    direction,
    route.source,
    route.targetIndex,
    route.source === 'windows' && devices.status === 'ready'
      ? devices.data.defaultDeviceId
      : null
  ])
  const audio = useAudioControl(volume, writeVolume, routeKey)
  return {
    ...audio,
    data,
    pending,
    error: error || audio.error,
    select: (id: string) => void select(id)
  }
}
