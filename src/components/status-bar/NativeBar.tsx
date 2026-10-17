import { Layers3, X } from 'lucide-react'
import { Cpu } from '../../features/cpu/Cpu'
import { Memory } from '../../features/memory/Memory'
import { Clock } from '../../features/clock/Clock'
import { Volume } from '../../features/volume/Volume'
import { bridge } from '../../services/system/bridge'

export default function NativeBar() {
  return (
    <nav
      className="native-bar grid h-screen w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#ffffff12] px-3.5 font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none"
      aria-label="Barra de status Strata"
    >
      <div className="flex min-w-0 items-center gap-4.5 max-[650px]:gap-2.5">
        <span className="flex min-w-0 items-center gap-2 font-semibold tracking-[0.4px] text-[#c8b6fa]">
          <Layers3 size={17} />
          <span className="max-[650px]:hidden">strata</span>
        </span>
        <span className="h-3.25 w-px shrink-0 bg-[#ffffff20]" />
        <Cpu />
        <Memory />
      </div>
      <Clock />
      <div className="flex min-w-0 items-center justify-end gap-3.5">
        <Volume />
        <span className="h-3.25 w-px shrink-0 bg-[#ffffff20]" />
        <button
          className="flex items-center justify-center rounded-sm border-0 bg-transparent p-1 text-inherit hover:bg-[#ffffff10] disabled:opacity-50 focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-[#d0b6ff]"
          aria-label="Sair do Strata"
          title="Sair do Strata em todos os monitores"
          onClick={() =>
            bridge
              .quit?.()
              .catch((e) => console.error('Não foi possível sair', e))
          }
        >
          <X size={13} />
        </button>
      </div>
    </nav>
  )
}
