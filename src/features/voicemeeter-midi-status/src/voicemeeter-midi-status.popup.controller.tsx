import {
  bridge,
  type ChannelData,
  type SystemEvent
} from '@/services/system/bridge'
import { useCallback, useMemo, useState } from 'react'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { usePopupContext } from '@/popups/context'
import { VoicemeeterMidiStatusPopup } from './voicemeeter-midi-status.popup'

type MidiStatus = ChannelData['voicemeeterMidi']

export function VoicemeeterMidiStatusController() {
  const { mode } = usePopupContext('voicemeeterMidiStatus')

  return mode === 'native' ? (
    <NativeVoicemeeterMidiStatus />
  ) : (
    <DemoVoicemeeterMidiStatus />
  )
}

function NativeVoicemeeterMidiStatus() {
  const [revision, setRevision] = useState(0)
  const midiStatus = useSystemChannel('voicemeeterMidi', revision)
  const [isRestarting, setIsRestarting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Derive error state from current status and explicit action errors
  // This avoids the need for effect-based status tracking
  const lastError = useMemo(() => {
    if (actionError) return actionError
    if (midiStatus.status === 'error') return midiStatus.error
    if (
      midiStatus.status === 'ready' &&
      midiStatus.data?.status === 'disconnected'
    ) {
      return 'Dispositivo MIDI desconectado'
    }
    return null
  }, [actionError, midiStatus])

  const restartAudioEngine = useCallback(async () => {
    if (!bridge.restartVoicemeeterAudioEngine) {
      setActionError('Reinicialização do Audio Engine indisponível')
      return
    }

    setIsRestarting(true)
    setActionError(null)

    try {
      await bridge.restartVoicemeeterAudioEngine()
      setRevision((r) => r + 1)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'Falha ao reiniciar Audio Engine'
      )
    } finally {
      setIsRestarting(false)
    }
  }, [])

  const dismissError = useCallback(() => {
    setActionError(null)
  }, [])

  return (
    <VoicemeeterMidiStatusPopup
      midiStatus={midiStatus}
      isRestarting={isRestarting}
      lastError={lastError}
      restartAudioEngine={restartAudioEngine}
      dismissError={dismissError}
    />
  )
}

// Constant timestamp for demo mode - defined outside component to avoid impure function in render
const DEMO_TIMESTAMP = Date.now()

function DemoVoicemeeterMidiStatus() {
  const [isRestarting, setIsRestarting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const midiStatus = useMemo<SystemEvent<MidiStatus>>(
    () => ({
      status: 'unavailable',
      data: {
        status: 'unavailable',
        reason: 'midi_api_error',
        message: 'Disponível apenas no build nativo (pnpm desktop)'
      },
      timestamp: DEMO_TIMESTAMP
    }),
    []
  )

  const restartAudioEngine = useCallback(async () => {
    setIsRestarting(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsRestarting(false)
  }, [])

  const dismissError = useCallback(() => {
    setActionError(null)
  }, [])

  return (
    <VoicemeeterMidiStatusPopup
      midiStatus={midiStatus}
      isRestarting={isRestarting}
      lastError={actionError}
      restartAudioEngine={restartAudioEngine}
      dismissError={dismissError}
    />
  )
}
