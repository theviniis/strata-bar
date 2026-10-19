import { Clock } from '../../features/clock/Clock'
import { Cpu } from '../../features/cpu/Cpu'
import { Disk } from '../../features/disk/Disk'
import { Gpu } from '../../features/gpu/Gpu'
import { Komorebi } from '../../features/komorebi/Komorebi'
import { Memory } from '../../features/memory/Memory'
import { Music } from '../../features/music/Music'
import { Volume } from '../../features/volume/Volume'
import { BarVerticalSeparator } from '../ui/bar-vertical-separator'
import { WidgetHoverGroup } from '../widget-hover'

export default function NativeBar() {
  return (
    <WidgetHoverGroup>
      <nav
        className="native-bar relative grid grid-cols-[1fr_max-content_1fr] h-screen w-full items-center border-b border-[#ffffff12] px-3.5 font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none"
        aria-label="Barra de status Strata"
      >
        <div className="flex min-w-0 items-center">
          <Komorebi />
        </div>

        <div className="flex justify-self-center items-center gap-2">
          <Cpu />
          <BarVerticalSeparator />
          <Gpu />
          <BarVerticalSeparator />
          <Memory />
          <BarVerticalSeparator />
          <Disk />
        </div>

        <div className="flex shrink-0 items-center gap-2 ml-auto">
          <Music />
          <Volume />
          <BarVerticalSeparator />
          <Clock showDate />
        </div>
      </nav>
    </WidgetHoverGroup>
  )
}
