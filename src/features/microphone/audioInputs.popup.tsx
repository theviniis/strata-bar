import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import type { ButtonLoadingProps } from '@/components/ui/button-loading'
import { CardFooter } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { WidgetItemOutput } from '@/components/widget-item'
import { Check, Mic, MicOff } from 'lucide-react'
import {
  type ChannelData,
  type SystemEvent,
  bridge,
  type VolumeChange
} from '@/services/system/bridge'
import { useAudioControl } from '@/features/audio/useAudioControl'
import { useConfig } from '@/stores/config'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'

export interface AudioInputsProps {
  inputs: SystemEvent<ChannelData['audioInputs']>
  volume: SystemEvent<ChannelData['microphone']>
  data: ChannelData['audioInputs'] | null
  pending: string | null
  error: string
  level: number
  muted: boolean
  select(id: string): void
  mute(): void
  setLevel(level: number): void
  retry(): void
}
export function AudioInputs({
  inputs,
  volume,
  data,
  pending,
  error,
  level,
  muted,
  select,
  mute,
  setLevel,
  retry
}: AudioInputsProps) {
  const Icon = muted ? MicOff : Mic

  return (
    <section aria-label="Entrada de audio">
      <div className="p-4">
        {volume.status === 'unavailable' && (
          <p>Configure a fonte em Configurações → Áudio → Entrada de áudio.</p>
        )}
        <div aria-busy={pending !== null}>
          {mapDataStatus('entrada de áudio', inputs.status)}
          {inputs.status === 'error' && (
            <Button variant={'destructive'} onClick={retry}>
              Tentar novamente
            </Button>
          )}
          {data?.devices.length === 0 && (
            <p className="p-3">Nenhuma entrada de áudio disponível.</p>
          )}
          <ButtonGroup orientation="vertical" aria-label="Microfones">
            {data?.devices.map((device) => (
              <AudioInputContentItem
                key={device.id}
                isActive={device.id === data.defaultDeviceId}
                device={device}
                onClick={() => void select(device.id)}
                disabled={pending !== null}
                isLoading={pending === device.id}
              />
            ))}
          </ButtonGroup>
        </div>
        {error && (
          <p role="alert" className="px-3 py-1 text-destructive">
            {error}
          </p>
        )}
      </div>
      {volume.status === 'error' && (
        <p role="alert">
          {volume.error}
          <Button onClick={retry}>Tentar novamente</Button>
        </p>
      )}
      {volume.status === 'unavailable' && <p>Microfone indisponível.</p>}
      <CardFooter className="gap-4">
        <Button
          disabled={volume.status !== 'ready' || pending !== null}
          aria-pressed={muted}
          aria-label={muted ? 'Ativar microfone' : 'Silenciar microfone'}
          onClick={() => void mute()}
          variant="ghost"
          size="icon"
        >
          <Icon size={16} />
        </Button>
        <Slider
          value={[level]}
          max={100}
          step={1}
          aria-label="Volume"
          disabled={volume.status !== 'ready' || pending !== null}
          onValueChange={(value) => setLevel(value[0])}
        />
        <WidgetItemOutput
          aria-label="Volume atual"
          className="min-w-8 text-right"
        >
          {volume.status === 'ready' ? level : '—'}
        </WidgetItemOutput>
      </CardFooter>
    </section>
  )
}
interface AudioInputContentItemProps extends Omit<
  ButtonLoadingProps,
  'variant' | 'children'
> {
  device: Record<'id' | 'name', string>
  isActive: boolean
  isLoading: boolean
}

function AudioInputContentItem({
  device,
  isActive,
  isLoading,
  disabled,
  ...props
}: AudioInputContentItemProps) {
  return (
    <Button
      className="grid grid-cols-[16px_1fr_16px]"
      variant="outline"
      disabled={isLoading || disabled}
      aria-pressed={!!isActive}
      disableAnimation
      {...props}
    >
      <Mic size={16} className="shrink-0 text-primary" />
      <span>{device.name}</span>
      {isLoading ? (
        <Spinner
          width={16}
          height={16}
          aria-hidden="true"
          className="text-primary"
        />
      ) : (
        isActive && (
          <Check
            size={16}
            aria-label="Entrada atual"
            className="shrink-0 text-primary"
          />
        )
      )}
    </Button>
  )
}

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
