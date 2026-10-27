import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { type ButtonLoadingProps } from '@/components/ui/button-loading'
import { CardFooter } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { WidgetItemOutput } from '@/components/widget-item'
import { Check, Volume2, VolumeX } from 'lucide-react'
import {
  type ChannelData,
  type SystemEvent
} from '../../services/system/bridge'

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
