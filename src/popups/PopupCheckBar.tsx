import { Volume } from '../features/volume/Volume'
import { Memory } from '../features/memory/Memory'
import { useState } from 'react'

/** Development-only fixture for --check-popups; excludes unrelated widget work. */
export function PopupCheckBar() {
  const [paused, setPaused] = useState(false)
  return (
    <nav className="native-bar flex h-screen items-center justify-end px-4">
      {!paused && <Memory />}
      <button
        aria-label={
          paused ? 'Retomar memória no teste' : 'Pausar memória no teste'
        }
        onClick={() => setPaused((value) => !value)}
      >
        Teste
      </button>
      <Volume />
    </nav>
  )
}
