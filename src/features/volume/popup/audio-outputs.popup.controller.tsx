import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '@/services/system/bridge'
import { useAudioControl } from '@/features/audio/src/use-audio-control'
import { useConfig } from '@/stores/config'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { usePopupContext } from '@/popups/context'
import { AudioOutputs } from './audio-outputs.popup'

type Outputs = ChannelData['audioOutputs']

type Volume = ChannelData['volume']

interface AudioProps {
  outputs: SystemEvent<Outputs>
  volume: SystemEvent<Volume>
  selectOutput(value: { deviceId: string }): Promise<Outputs>
  setVolume(value: VolumeChange): Promise<Volume>
  retry(): void
}

export function AudioOutputsController() {
  const { mode } = usePopupContext('audioOutputs')
  return mode === 'native' ? <NativeAudioOutputs /> : <DemoAudioOutputs />
}

function NativeAudioOutputs() {
  const [revision, setRevision] = useState(0)
  const outputs = useSystemChannel('audioOutputs', revision)
  const volume = useSystemChannel('volume')
  return (
    <AudioOutputsContent
      outputs={outputs}
      volume={volume}
      selectOutput={(value) => {
        if (!bridge.setAudioOutput)
          return Promise.reject(new Error('Audio output switching unavailable'))
        return bridge.setAudioOutput(value)
      }}
      setVolume={bridge.setVolume}
      retry={() => setRevision((value) => value + 1)}
    />
  )
}

function DemoAudioOutputs() {
  const [outputs, setOutputs] = useState<Outputs>({
    devices: [
      { id: 'demo-speakers', name: 'Alto-falantes (demo)' },
      { id: 'demo-headphones', name: 'Fones de ouvido (demo)' }
    ],
    defaultDeviceId: 'demo-speakers'
  })
  const [volume, setVolume] = useState<Volume>({ level: 64, muted: false })
  const write = useCallback(
    async (change: VolumeChange) => {
      const next = { ...volume, ...change }
      setVolume(next)
      return next
    },
    [volume]
  )
  return (
    <AudioOutputsContent
      outputs={{ status: 'ready', data: outputs }}
      volume={{ status: 'ready', data: volume }}
      selectOutput={async ({ deviceId }) => {
        const next = { ...outputs, defaultDeviceId: deviceId }
        setOutputs(next)
        return next
      }}
      setVolume={write}
      retry={() => {}}
    />
  )
}

function AudioOutputsContent({
  outputs,
  volume,
  selectOutput,
  setVolume,
  retry
}: AudioProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState<{
    base: typeof outputs
    data: ChannelData['audioOutputs']
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
    (confirmed?.base === outputs ? confirmed.data : null) ??
    (outputs.status === 'ready' ? outputs.data : null)
  async function select(id: string) {
    if (busy.current) return
    busy.current = true
    setPending(id)
    setError('')
    try {
      const result = await selectOutput({ deviceId: id })
      if (mounted.current) setConfirmed({ base: outputs, data: result })
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }
  const route = useConfig((state) => state.config.audio.output)
  const routeKey = `${route.source}:${route.targetIndex}:${route.source === 'windows' && outputs.status === 'ready' ? outputs.data.defaultDeviceId : ''}`
  const audio = useAudioControl(volume, setVolume, routeKey)
  return (
    <AudioOutputs
      outputs={outputs}
      volume={volume}
      data={data}
      pending={pending}
      error={error || audio.error}
      level={audio.level}
      muted={audio.muted}
      select={(id) => void select(id)}
      mute={audio.mute}
      setLevel={audio.setLevel}
      retry={retry}
    />
  )
}
