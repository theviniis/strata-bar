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
      className="bar-volume"
      title={
        error ||
        (value.status === 'error' ? value.error : '') ||
        'Volume do dispositivo padrão'
      }
    >
      <button
        aria-label={muted ? 'Ativar som' : 'Silenciar'}
        aria-pressed={muted}
        disabled={!ready}
        onClick={() => commit({ muted: !muted })}
      >
        <Icon size={15} />
      </button>
      <input
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
      <output aria-label="Volume atual">
        {ready ? `${level}%` : value.status === 'loading' ? '…' : 'Erro'}
      </output>
      {error && (
        <span role="alert" className="bar-error">
          !
        </span>
      )}
    </div>
  )
}
