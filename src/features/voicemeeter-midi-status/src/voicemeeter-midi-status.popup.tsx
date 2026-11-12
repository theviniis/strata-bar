import { definePopup } from '@/popups/definition'
import { mapDataStatus } from '@/components/popup-status'
import { Button } from '@/components/ui/button'
import { CardFooter } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  RefreshCw,
  Cable
} from 'lucide-react'
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
  const isUnavailable =
    midiStatus.status === 'unavailable' || data?.status === 'unavailable'
  const hasError =
    midiStatus.status === 'error' || isDisconnected || !!lastError

  const deviceName = getDeviceName(data)
  const lastCheck = getLastCheck(data)
  const unavailableReason = getUnavailableReason(data)

  return (
    <section aria-label="Status MIDI do Voicemeeter">
      <div className="p-4 min-w-70">
        <div className="flex items-center gap-3 mb-4">
          <Cable size={24} className="text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Voicemeeter MIDI Status</h2>
            <p className="text-sm text-muted-foreground">WORLDE easy control</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${
                isConnected
                  ? 'bg-green-500/10 text-green-500'
                  : isDisconnected || hasError
                    ? 'bg-red-500/10 text-red-500'
                    : isChecking
                      ? 'bg-yellow-500/10 text-yellow-500'
                      : 'bg-gray-500/10 text-gray-500'
              }`}
            >
              {isConnected && <CheckCircle size={20} />}
              {isDisconnected && <XCircle size={20} />}
              {isChecking && (
                <Spinner width={20} height={20} className="text-yellow-500" />
              )}
              {isUnavailable && <AlertCircle size={20} />}
            </div>
            <div className="flex-1">
              <p className="font-medium">
                {isConnected && 'Conectado'}
                {isDisconnected && 'Desconectado'}
                {isChecking && 'Verificando...'}
                {isUnavailable && 'Indisponível'}
                {midiStatus.status === 'error' && 'Erro'}
              </p>
              {deviceName && (
                <p className="text-sm text-muted-foreground">{deviceName}</p>
              )}
            </div>
          </div>

          {lastCheck && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock size={14} />
              <span>Última verificação: {formatRelativeTime(lastCheck)}</span>
            </div>
          )}

          {unavailableReason && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <strong>Motivo: </strong>
              {unavailableReason}
            </div>
          )}

          {midiStatus.status === 'error' && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <strong>Erro: </strong>
              {midiStatus.error}
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={dismissError}
              >
                Dispensar
              </Button>
            </div>
          )}

          {mapDataStatus('dispositivo MIDI', midiStatus.status)}
        </div>

        <CardFooter className="gap-2 pt-4 border-t">
          <Button
            variant="outline"
            className="flex-1"
            onClick={restartAudioEngine}
            disabled={
              isRestarting || (!isDisconnected && !hasError && !isUnavailable)
            }
            aria-busy={isRestarting}
          >
            {isRestarting ? (
              <>
                <Spinner width={16} height={16} className="mr-2" />
                Reiniciando...
              </>
            ) : (
              <>
                <RefreshCw size={16} className="mr-2" />
                Reiniciar Audio Engine
              </>
            )}
          </Button>
        </CardFooter>
      </div>
    </section>
  )
}

export default definePopup({
  label: 'Voicemeeter MIDI Status',
  Content: VoicemeeterMidiStatusController
})
