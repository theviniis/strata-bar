import { useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'
import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '@/services/system/bridge'
import { AudioInputs } from './AudioInputs'

type Inputs = ChannelData['audioInputs']
type Volume = ChannelData['microphone']
interface AudioProps {
  inputs: SystemEvent<Inputs>
  volume: SystemEvent<Volume>
  selectInput(value: { deviceId: string }): Promise<Inputs>
  setVolume(value: VolumeChange): Promise<unknown>
  retry(): void
}

export function AudioInputsController() {
  const { mode } = usePopupContext('audioInputs')
  return mode === 'native' ? <NativeAudioInputs /> : <DemoAudioInputs />
}
function NativeAudioInputs() {
  const [revision, setRevision] = useState(0)
  const inputs = useSystemChannel('audioInputs', revision)
  const volume = useSystemChannel('microphone', revision)
  return (
    <AudioInputsContent
      inputs={inputs}
      volume={volume}
      selectInput={(value) => {
        if (!bridge.setAudioInput)
          return Promise.reject(new Error('Seleção de microfone indisponível'))
        return bridge.setAudioInput(value)
      }}
      setVolume={(value) =>
        bridge.setMicrophone
          ? bridge.setMicrophone(value)
          : Promise.reject(new Error('Controle do microfone indisponível'))
      }
      retry={() => setRevision((value) => value + 1)}
    />
  )
}
function DemoAudioInputs() {
  const [inputs, setInputs] = useState<Inputs>({
    devices: [
      { id: 'demo-microphone', name: 'Microfone (demo)' },
      { id: 'demo-headset', name: 'Microfone do headset (demo)' }
    ],
    defaultDeviceId: 'demo-microphone'
  })
  const [volume, setVolume] = useState<Volume>({ level: 64, muted: false })
  return (
    <AudioInputsContent
      inputs={{ status: 'ready', data: inputs }}
      volume={{ status: 'ready', data: volume }}
      selectInput={async ({ deviceId }) => {
        const next = { ...inputs, defaultDeviceId: deviceId }
        setInputs(next)
        return next
      }}
      setVolume={async (change) => {
        setVolume((value) => ({ ...value, ...change }))
      }}
      retry={() => {}}
    />
  )
}

function AudioInputsContent({
  inputs,
  volume,
  selectInput,
  setVolume,
  retry
}: AudioProps) {
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [draft, setDraft] = useState<number | null>(null)
  const [confirmed, setConfirmed] = useState<{
    base: typeof inputs
    data: ChannelData['audioInputs']
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
    (confirmed?.base === inputs ? confirmed.data : null) ??
    (inputs.status === 'ready' ? inputs.data : null)
  async function select(id: string) {
    if (busy.current) return
    busy.current = true
    setPending(id)
    setError('')
    try {
      const result = await selectInput({ deviceId: id })
      if (mounted.current) setConfirmed({ base: inputs, data: result })
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
    <AudioInputs
      inputs={inputs}
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
