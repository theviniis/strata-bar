import { useEffect, useRef, useState } from 'react'
import { Check, Volume2, VolumeX } from 'lucide-react'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import {
  bridge,
  type ChannelData,
  type SystemEvent,
  type VolumeChange
} from '../../services/system/bridge'
import { usePopupContext } from '../../popups/context'

type Outputs = ChannelData['audioOutputs']
type Volume = ChannelData['volume']
interface AudioProps {
  outputs: SystemEvent<Outputs>
  volume: SystemEvent<Volume>
  selectOutput(value: { deviceId: string }): Promise<Outputs>
  setVolume(value: VolumeChange): Promise<unknown>
  retry(): void
}
const button =
  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 group-data-[theme=light]:hover:bg-[#ece6f2]'

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
    <div className="flex flex-col">
      <h2 className="shrink-0 px-3 py-2 text-sm font-semibold">
        Saída de áudio
      </h2>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        aria-busy={pending !== null}
      >
        {outputs.status === 'loading' && (
          <p role="status" className="p-3">
            Carregando saídas…
          </p>
        )}
        {outputs.status === 'error' && (
          <p role="alert" className="p-3 text-[#ff9b91]">
            {outputs.error}
          </p>
        )}
        {outputs.status === 'error' && (
          <button className={button} onClick={retry}>
            Tentar novamente
          </button>
        )}
        {outputs.status === 'unavailable' && (
          <p className="p-3">Saídas de áudio indisponíveis.</p>
        )}
        {data?.devices.length === 0 && (
          <p className="p-3">Nenhuma saída de áudio disponível.</p>
        )}
        {data?.devices.map((device) => (
          <button
            key={device.id}
            className={button}
            aria-pressed={device.id === data.defaultDeviceId}
            disabled={pending !== null}
            onClick={() => void select(device.id)}
          >
            <Volume2 size={16} className="shrink-0 text-[#bba9e5]" />
            <span className="min-w-0 flex-1 wrap-break-word">
              {device.name}
            </span>
            {device.id === data.defaultDeviceId && (
              <Check
                size={16}
                aria-label="Saída atual"
                className="shrink-0 text-[#c5b1ed]"
              />
            )}
          </button>
        ))}
      </div>
      {pending && (
        <p role="status" className="px-3 py-1">
          Aplicando…
        </p>
      )}
      {error && (
        <p role="alert" className="px-3 py-1 text-[#ff9b91]">
          {error}
        </p>
      )}
      <div className="mt-2 shrink-0 border-t border-white/10 pt-2 group-data-[theme=light]:border-[#ded7e5]">
        <div className="flex items-center gap-3 px-3 py-2">
          <input
            aria-label="Volume"
            type="range"
            min="0"
            max="100"
            value={level}
            disabled={volume.status !== 'ready' || pending !== null}
            className="min-w-0 flex-1 accent-[#c5b1ed] focus-visible:outline-2 focus-visible:outline-[#c5b1ed]"
            onChange={(event) => setDraft(Number(event.target.value))}
            onPointerUp={(event) =>
              void setLevel(Number(event.currentTarget.value))
            }
            onKeyUp={(event) => {
              if (
                [
                  'ArrowLeft',
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowDown',
                  'Home',
                  'End',
                  'PageUp',
                  'PageDown'
                ].includes(event.key)
              )
                void setLevel(Number(event.currentTarget.value))
            }}
          />
          <output aria-label="Volume atual" className="min-w-8 text-right">
            {volume.status === 'ready' ? `${level}%` : '—'}
          </output>
        </div>
        <button
          className={button}
          disabled={volume.status !== 'ready' || pending !== null}
          aria-pressed={muted}
          onClick={() => void mute()}
        >
          <Icon size={16} />
          {muted ? 'Ativar som' : 'Silenciar'}
        </button>
      </div>
    </div>
  )
}
