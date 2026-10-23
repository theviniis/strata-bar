import { useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'
import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '@/services/system/bridge'
import { AudioOutputs } from './AudioOutputs'

type Outputs = ChannelData['audioOutputs']
type Volume = ChannelData['volume']
interface AudioProps {
  outputs: SystemEvent<Outputs>
  volume: SystemEvent<Volume>
  selectOutput(value: { deviceId: string }): Promise<Outputs>
  setVolume(value: VolumeChange): Promise<unknown>
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
      setVolume={(value) => bridge.setVolume(value)}
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
  return (
    <AudioOutputsContent
      outputs={{ status: 'ready', data: outputs }}
      volume={{ status: 'ready', data: volume }}
      selectOutput={async ({ deviceId }) => {
        const next = { ...outputs, defaultDeviceId: deviceId }
        setOutputs(next)
        return next
      }}
      setVolume={async (change) => {
        setVolume((value) => ({ ...value, ...change }))
      }}
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
  const [draft, setDraft] = useState<number | null>(null)
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
  async function mute() {
    if (volume.status !== 'ready' || busy.current) return
    busy.current = true
    setPending('mute')
    try {
      await setVolume({ muted: !volume.data.muted })
      if (mounted.current) setError('')
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      busy.current = false
      if (mounted.current) setPending(null)
    }
  }
  async function setLevel(level: number) {
    if (volume.status !== 'ready' || busy.current) return
    busy.current = true
    setPending('level')
    try {
      await setVolume({ level })
      if (mounted.current) setError('')
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      busy.current = false
      if (mounted.current) {
        setDraft(null)
        setPending(null)
      }
    }
  }
  const level = draft ?? (volume.status === 'ready' ? volume.data.level : 0)
  const muted = volume.status === 'ready' && volume.data.muted
  return (
    <AudioOutputs
      outputs={outputs}
      volume={volume}
      data={data}
      pending={pending}
      error={error}
      level={level}
      muted={muted}
      select={(id) => void select(id)}
      mute={() => void mute()}
      setDraft={setDraft}
      setLevel={(value) => void setLevel(value)}
      retry={retry}
    />
  )
}
