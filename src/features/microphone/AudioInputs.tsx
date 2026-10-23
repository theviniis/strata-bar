import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { type ButtonLoadingProps } from '@/components/ui/button-loading'
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { WidgetItemOutput } from '@/components/widget-item'
import { Check, Mic, MicOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { usePopupContext } from '../../popups/context'
import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '../../services/system/bridge'

type Inputs = ChannelData['audioInputs']
type Volume = ChannelData['microphone']
interface AudioProps {
  inputs: SystemEvent<Inputs>
  volume: SystemEvent<Volume>
  selectInput(value: { deviceId: string }): Promise<Inputs>
  setVolume(value: VolumeChange): Promise<unknown>
  retry(): void
}

export function AudioInputs() {
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

interface AudioInputContentItemProps extends Omit<
  ButtonLoadingProps,
  'variant' | 'children'
> {
  device: Record<'id' | 'name', string>
  isActive?: boolean
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

function EmptyInputItems() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner className="text-primary" />
        </EmptyMedia>
        <EmptyTitle>Carregando dispositivos de áudio</EmptyTitle>
        <EmptyDescription>
          Por favor aguarde enquanto carregamos os dispositivos de áudio
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
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
  const Icon = muted ? MicOff : Mic

  return (
    <>
      <div className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Entrada de áudio</CardTitle>
          </div>
          <CardDescription>
            Controle o volume e a entrada de áudio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {volume.status === 'unavailable' && (
            <p>Configure a fonte em Configurações → Entrada de áudio.</p>
          )}
          <div className="" aria-busy={pending !== null}>
            {inputs.status === 'loading' && <EmptyInputItems />}
            {inputs.status === 'error' && (
              <p role="alert" className="p-3 text-destructive">
                {inputs.error}
              </p>
            )}
            {inputs.status === 'error' && (
              <Button variant={'destructive'} onClick={retry}>
                Tentar novamente
              </Button>
            )}
            {inputs.status === 'unavailable' && (
              <p className="p-3">Entradas de áudio indisponíveis.</p>
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
        </CardContent>
        {volume.status === 'error' && (
          <p role="alert">
            {volume.error}
            <Button onClick={retry}>Tentar novamente</Button>
          </p>
        )}
        {volume.status === 'unavailable' && <p>Microfone indisponível.</p>}
        <CardFooter className="gap-4">
          <Button
            disabled={
              volume.status !== 'ready' ||
              !data?.defaultDeviceId ||
              pending !== null
            }
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
            disabled={
              volume.status !== 'ready' ||
              !data?.defaultDeviceId ||
              pending !== null
            }
            onValueChange={(value) => setDraft(value[0])}
            onValueCommit={(value) => void setLevel(value[0])}
          />
          <WidgetItemOutput
            aria-label="Volume atual"
            className="min-w-8 text-right"
          >
            {volume.status === 'ready' ? level : '—'}
          </WidgetItemOutput>
        </CardFooter>
      </div>
    </>
  )
}
