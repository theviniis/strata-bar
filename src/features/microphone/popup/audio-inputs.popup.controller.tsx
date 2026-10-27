import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '@/services/system/bridge'
import { useAudioControl } from '@/features/audio/src/use-audio-control'
import { useConfig } from '@/stores/config'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'
import { AudioInputs } from './audio-inputs.popup'

const writeMicrophone = (value: VolumeChange) =>
  bridge.setMicrophone
    ? bridge.setMicrophone(value)
    : Promise.reject(new Error('Controle do microfone indisponível'))

type Inputs = ChannelData['audioInputs']

type Volume = ChannelData['microphone']

interface AudioProps {
  inputs: SystemEvent<Inputs>
  volume: SystemEvent<Volume>
  selectInput(value: { deviceId: string }): Promise<Inputs>
  setVolume(value: VolumeChange): Promise<Volume>
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
      setVolume={writeMicrophone}
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
  const write = useCallback(
    async (change: VolumeChange) => {
      const next = { ...volume, ...change }
      setVolume(next)
      return next
    },
    [volume]
  )
  return (
    <AudioInputsContent
      inputs={{ status: 'ready', data: inputs }}
      volume={{ status: 'ready', data: volume }}
      selectInput={async ({ deviceId }) => {
        const next = { ...inputs, defaultDeviceId: deviceId }
        setInputs(next)
        return next
      }}
      setVolume={write}
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
  const route = useConfig((state) => state.config.audio.input)
  const routeKey = `${route.source}:${route.targetIndex}:${route.source === 'windows' && inputs.status === 'ready' ? inputs.data.defaultDeviceId : ''}`
  const audio = useAudioControl(volume, setVolume, routeKey)
  return (
    <AudioInputs
      inputs={inputs}
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
