import { Clock } from '../../features/clock/Clock'
import { Cpu } from '../../features/cpu/Cpu'
import { Komorebi } from '../../features/komorebi/Komorebi'
import { Memory } from '../../features/memory/Memory'
import { Volume } from '../../features/volume/Volume'
import { BarVerticalSeparator } from '../ui/bar-vertical-separator'

export default function NativeBar() {
  return (
    <nav
      className="native-bar grid h-screen w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center border-b border-[#ffffff12] px-3.5 font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none"
      aria-label="Barra de status Strata"
    >
      <div className="flex min-w-0 items-center">
        <Komorebi />
      </div>
      <div className="flex items-center gap-2">
        <Cpu />
        <BarVerticalSeparator />
        <Memory />
      </div>
      <div className="flex min-w-0 items-center justify-end gap-2">
        <Volume />
        <BarVerticalSeparator />
        <Clock />
      </div>
    </nav>
  )
}
