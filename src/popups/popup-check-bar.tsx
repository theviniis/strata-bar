import { VolumeController } from '../features/volume/widget/volume.controller'
import { MemoryController } from '../features/memory/widget/memory.controller'
import { CpuController } from '../features/cpu/widget/cpu.controller'
import { GpuController } from '../features/gpu/widget/gpu.controller'
import { useState } from 'react'

/** Development-only fixture for --check-popups; excludes unrelated widget work. */
export function PopupCheckBar() {
  const [paused, setPaused] = useState(false)
  return (
    <nav className="native-bar flex h-screen items-center justify-end px-4">
      {!paused && <MemoryController />}
      {!paused && <CpuController />}
      {!paused && <GpuController />}
      <button
        aria-label={
          paused ? 'Retomar memória no teste' : 'Pausar memória no teste'
        }
        onClick={() => setPaused((value) => !value)}
      >
        Teste
      </button>
      <VolumeController />
    </nav>
  )
}
