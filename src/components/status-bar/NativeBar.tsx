import { Clock } from '../../features/clock/Clock'
import { Cpu } from '../../features/cpu/Cpu'
import { Komorebi } from '../../features/komorebi/Komorebi'
import { Memory } from '../../features/memory/Memory'
import { Volume } from '../../features/volume/Volume'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'

export default function NativeBar() {
  const quitTip = useOverlayTooltip('Sair do Strata em todos os monitores')
  return (
    <nav
      className="native-bar grid h-screen w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#ffffff12] px-3.5 font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none"
      aria-label="Barra de status Strata"
    >
      <div className="flex min-w-0 items-center gap-4.5 max-[650px]:gap-2.5">
        <Komorebi />
        <span className="h-3.25 w-px shrink-0 bg-[#ffffff20]" />
        <Cpu />
        <Memory />
      </div>
      <Clock />
      <div className="flex min-w-0 items-center justify-end gap-3.5">
        <Volume />
      </div>
    </nav>
  )
}
