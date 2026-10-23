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
  setDraft(level: number): void
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
  setDraft,
  setLevel,
  retry
}: AudioInputsProps) {
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
