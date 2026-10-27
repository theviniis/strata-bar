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
  const audio = useAudioSelection({
    direction: 'output',
    devices: outputs,
    volume,
    selectDevice: selectOutput,
    writeVolume: setVolume
  })
  return (
    <AudioOutputs
      outputs={outputs}
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
