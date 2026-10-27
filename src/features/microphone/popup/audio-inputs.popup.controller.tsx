import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '@/services/system/bridge'
import { useAudioSelection } from '@/features/audio/src/use-audio-selection'
import { useCallback, useState } from 'react'
import { useSystemChannel } from '@/hooks/use-system-channel'
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
  const audio = useAudioSelection({
    direction: 'input',
    devices: inputs,
    volume,
    selectDevice: selectInput,
    writeVolume: setVolume
  })
  return (
    <AudioInputs
      inputs={inputs}
      volume={volume}
      data={audio.data}
      pending={audio.pending}
      error={audio.error}
      level={audio.level}
      muted={audio.muted}
      select={audio.select}
      mute={audio.mute}
      setLevel={audio.setLevel}
      retry={retry}
    />
  )
}
