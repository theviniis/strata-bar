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
import { Check, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { usePopupContext } from '../../popups/context'
import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '../../services/system/bridge'

type Outputs = ChannelData['audioOutputs']
type Volume = ChannelData['volume']
interface AudioProps {
  outputs: SystemEvent<Outputs>
  volume: SystemEvent<Volume>
  selectOutput(value: { deviceId: string }): Promise<Outputs>
  setVolume(value: VolumeChange): Promise<unknown>
  retry(): void
}

export function AudioOutputs() {
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

interface AudioOutputContentItemProps extends Omit<
  ButtonLoadingProps,
  'variant' | 'children'
> {
  device: Record<'id' | 'name', string>
  isActive?: boolean
}

function AudioOutputContentItem({
  device,
  isActive,
  isLoading,
  disabled,
  ...props
}: AudioOutputContentItemProps) {
  return (
    <Button
      className="grid grid-cols-[16px_1fr_16px]"
      variant="outline"
      disabled={isLoading || disabled}
      aria-pressed={!!isActive}
      {...props}
    >
      <Volume2 size={16} className="shrink-0 text-primary" />
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
            aria-label="Saída atual"
            className="shrink-0 text-primary"
          />
        )
      )}
    </Button>
  )
}

function EmptyOutputItems() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner className="text-primary" />
        </EmptyMedia>
        <EmptyTitle>Carregando dispositivos de audio</EmptyTitle>
        <EmptyDescription>
          Por favor aguarde enquanto carregamos os dispositivos de audio
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
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
    try {
      await setVolume({ level })
      if (mounted.current) setError('')
    } catch (e) {
      if (mounted.current) setError(String(e))
    } finally {
      busy.current = false
      if (mounted.current) setDraft(null)
    }
  }
  const level = draft ?? (volume.status === 'ready' ? volume.data.level : 0)
  const muted = volume.status === 'ready' && volume.data.muted
  const Icon = muted ? VolumeX : Volume2

  return (
    <>
      <div className="flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>Saída de audio</CardTitle>
          </div>
          <CardDescription>
            Controle o volume e a saída de audio
          </CardDescription>
        </CardHeader>
        <CardContent>
          {volume.status === 'unavailable' && (
            <p>Configure a fonte em Configurações → Saída de áudio.</p>
          )}
          <div className="" aria-busy={pending !== null}>
            {outputs.status === 'loading' && <EmptyOutputItems />}
            {outputs.status === 'error' && (
              <p role="alert" className="p-3 text-destructive">
                {outputs.error}
              </p>
            )}
            {outputs.status === 'error' && (
              <Button variant={'destructive'} onClick={retry}>
                Tentar novamente
              </Button>
            )}
            {outputs.status === 'unavailable' && (
              <p className="p-3">Saídas de áudio indisponíveis.</p>
            )}
            {data?.devices.length === 0 && (
              <p className="p-3">Nenhuma saída de áudio disponível.</p>
            )}
            <ButtonGroup
              orientation="vertical"
              aria-label="Audio device controls"
            >
              {data?.devices.map((device) => (
                <AudioOutputContentItem
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
        <CardFooter className="gap-4">
          <Button
            disabled={volume.status !== 'ready' || pending !== null}
            aria-pressed={muted}
            aria-label={muted ? 'Ativar som' : 'Silenciar'}
            onClick={() => void mute()}
            variant="ghost"
            size="icon"
          >
            <Icon size={16} />
          </Button>
          <Slider
            value={[level]}
            defaultValue={[100]}
            max={100}
            step={1}
            aria-label="Volume"
            disabled={volume.status !== 'ready' || pending !== null}
            onValueChange={(value) => setDraft(value[0])}
            onValueCommit={(value) => void setLevel(value[0])}
          />
          <WidgetItemOutput
            aria-label="Volume atual"
            className="min-w-8 text-right"
          >
            {volume.status === 'ready' ? `${level}%` : '—'}
          </WidgetItemOutput>
        </CardFooter>
      </div>
    </>
  )
}
