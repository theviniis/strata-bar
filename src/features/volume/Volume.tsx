import { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { useSystemChannel } from '../../hooks/useSystemChannel'
import { bridge, type VolumeChange } from '../../services/system/bridge'

export function Volume() {
  const value = useSystemChannel('volume'),
    [draft, setDraft] = useState<number | null>(null),
    [error, setError] = useState('')
  const ready = value.status === 'ready',
    snapshot = value.status === 'ready' ? value.data : null,
    level = draft ?? snapshot?.level ?? 0,
    muted = snapshot?.muted ?? false
  async function commit(change: VolumeChange) {
    try {
      await bridge.setVolume(change)
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setDraft(null)
    }
  }
  const Icon = muted ? VolumeX : Volume2
  return (
    <div
      className="flex min-w-0 items-center gap-[6px]"
      title={
        error ||
        (value.status === 'error' ? value.error : '') ||
        'Volume do dispositivo padrão'
      }
    >
      <button
        className="flex items-center justify-center rounded-[4px] border-0 bg-transparent p-[4px] text-inherit hover:bg-[#ffffff10] disabled:opacity-50 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#d0b6ff]"
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
        aria-pressed={muted}
        disabled={!ready}
        onClick={() => commit({ muted: !muted })}
      >
        <Icon size={15} className="text-[#bba9e5]" />
      </button>
      <input
        className="mx-[6px] h-[3px] w-[84px] accent-[#c5b1ed] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#d0b6ff] max-[650px]:w-[50px]"
        aria-label="Volume"
        type="range"
        min="0"
        max="100"
        value={level}
        disabled={!ready}
        onChange={(e) => setDraft(Number(e.target.value))}
        onPointerUp={(e) => commit({ level: Number(e.currentTarget.value) })}
        onKeyUp={(e) => {
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
            ].includes(e.key)
          )
            commit({ level: Number(e.currentTarget.value) })
        }}
      />
      <output className="min-w-[30px] text-[10px]" aria-label="Volume atual">
        {ready ? `${level}%` : value.status === 'loading' ? '…' : 'Erro'}
      </output>
      {error && (
        <span role="alert" className="text-[#ff9b91]">
          !
        </span>
      )}
    </div>
  )
}
