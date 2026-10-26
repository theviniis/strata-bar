import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { type ButtonLoadingProps } from '@/components/ui/button-loading'
import { CardFooter } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { WidgetItemOutput } from '@/components/widget-item'
import { Check, Mic, MicOff } from 'lucide-react'
import {
  type ChannelData,
  type SystemEvent
} from '../../services/system/bridge'

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
