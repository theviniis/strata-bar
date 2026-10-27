import { definePopup } from '@/popups/definition'
import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import type { ButtonLoadingProps } from '@/components/ui/button-loading'
import { CardFooter } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { WidgetItemOutput } from '@/components/widget-item'
import { Check, Volume2, VolumeX } from 'lucide-react'
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

export interface AudioOutputsProps {
  outputs: SystemEvent<ChannelData['audioOutputs']>
  volume: SystemEvent<ChannelData['volume']>
  data: ChannelData['audioOutputs'] | null
  pending: string | null
  error: string
  level: number
  muted: boolean
  select(id: string): void
  mute(): void
  setLevel(level: number): void
  retry(): void
}
export function AudioOutputs({
  outputs,
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
}: AudioOutputsProps) {
  const Icon = muted ? VolumeX : Volume2

  return (
    <section aria-label="Saída de audio">
      <div className="p-4">
        {volume.status === 'unavailable' && (
          <p>Configure a fonte em Configurações → Áudio → Saída de áudio.</p>
        )}
        <div className="" aria-busy={pending !== null}>
          {mapDataStatus('saída de áudio', outputs.status)}
          {outputs.status === 'error' && (
            <Button variant={'destructive'} onClick={retry}>
              Tentar novamente
            </Button>
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
      </div>
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
interface AudioOutputContentItemProps extends Omit<
  ButtonLoadingProps,
  'variant' | 'children'
> {
  device: Record<'id' | 'name', string>
  isActive: boolean
  isLoading: boolean
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
      disableAnimation
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

export default definePopup({
  label: 'Saída de áudio',
  Content: AudioOutputsController
})
