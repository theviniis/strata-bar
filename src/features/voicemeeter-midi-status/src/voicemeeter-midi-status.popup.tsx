import { definePopup } from '@/popups/definition'
import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { CardFooter } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { DataLoading, DataUnavaliable } from '@/components/popup-helpers'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@/components/ui/item'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import {
  type ChannelData,
  type SystemEvent,
  type MidiDeviceStatus
} from '@/services/system/bridge'
import { VoicemeeterMidiStatusController } from './voicemeeter-midi-status.popup.controller'
import { formatRelativeTime } from '@/lib/date'

export interface VoicemeeterMidiStatusPopupProps {
  midiStatus: SystemEvent<ChannelData['voicemeeterMidi']>
  isRestarting: boolean
  lastError: string | null
  restartAudioEngine: () => Promise<void>
  dismissError: () => void
}

function getDeviceName(data: MidiDeviceStatus | null): string | undefined {
  if (!data) return undefined
  if (data.status === 'connected' || data.status === 'disconnected') {
    return data.deviceName
  }
  return undefined
}

function getLastCheck(data: MidiDeviceStatus | null): number | undefined {
  if (!data) return undefined
  if ('lastCheck' in data) {
    return data.lastCheck
  }
  return undefined
}

function getUnavailableReason(
  data: MidiDeviceStatus | null
): string | undefined {
  if (!data || data.status !== 'unavailable') return undefined
  switch (data.reason) {
    case 'voicemeeter_not_installed':
      return 'Voicemeeter não está instalado'
    case 'voicemeeter_not_running':
      return 'Voicemeeter não está em execução'
    case 'midi_api_error':
      return `Erro na API MIDI: ${data.message ?? 'Desconhecido'}`
  }
}

export function VoicemeeterMidiStatusPopup({
  midiStatus,
  isRestarting,
  lastError,
  restartAudioEngine,
  dismissError
}: VoicemeeterMidiStatusPopupProps) {
  const data = midiStatus.status === 'ready' ? midiStatus.data : null
  const isConnected = data?.status === 'connected'
  const isDisconnected = data?.status === 'disconnected'
  const isChecking = data?.status === 'checking'
  const deviceName = getDeviceName(data)
  const lastCheck = getLastCheck(data)
  const unavailableReason = getUnavailableReason(data)

  return (
    <section aria-label="Status MIDI do Voicemeeter">
      <div className="flex min-w-70 flex-col gap-3 p-4">
        {mapDataStatus('dispositivo MIDI', midiStatus.status)}
        {(isConnected || isDisconnected) && (
          <Item variant="outline" size="sm" role="status">
            <ItemMedia variant="icon">
              {isConnected ? (
                <CheckCircle aria-hidden="true" className="text-primary" />
              ) : (
                <XCircle aria-hidden="true" className="text-destructive" />
              )}
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{deviceName}</ItemTitle>
              <ItemDescription>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </ItemDescription>
            </ItemContent>
          </Item>
        )}
        {isChecking && (
          <DataLoading
            title="Verificando dispositivo MIDI"
            description="Aguarde enquanto verificamos a conexão."
          />
        )}
        {data?.status === 'unavailable' && (
          <DataUnavaliable
            title="Dispositivo MIDI indisponível"
            description={unavailableReason}
          />
        )}
        {lastCheck !== undefined && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Clock size={14} aria-hidden="true" />
            Última verificação: {formatRelativeTime(lastCheck)}
          </p>
        )}
        {lastError && (
          <Alert variant="destructive">
            <AlertDescription>{lastError}</AlertDescription>
            <Button variant="ghost" size="sm" onClick={dismissError}>
              Dispensar
            </Button>
          </Alert>
        )}
      </div>
      <CardFooter>
        <Button
          variant="outline"
          className="flex-1"
          onClick={restartAudioEngine}
          disabled={isRestarting}
          aria-busy={isRestarting}
        >
          {isRestarting ? (
            <Spinner data-icon="inline-start" aria-hidden="true" />
          ) : (
            <RefreshCw data-icon="inline-start" aria-hidden="true" />
          )}
          {isRestarting ? 'Reiniciando...' : 'Reiniciar Audio Engine'}
        </Button>
      </CardFooter>
    </section>
  )
}

export default definePopup({
  label: 'Voicemeeter MIDI Status',
  Content: VoicemeeterMidiStatusController
})
