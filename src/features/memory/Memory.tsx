import { MemoryStick } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'

export function Memory() {
  const value = useSystemChannel('memory')
  const text =
    value.status === 'error'
      ? value.error
      : value.status === 'ready'
        ? `${(value.data.usedBytes / 1073741824).toFixed(1)} / ${(value.data.totalBytes / 1073741824).toFixed(1)} GiB`
        : 'Carregando RAM'
  const tip = useOverlayTooltip(text)
  return (
    <div className="flex min-w-0 items-center gap-2" {...tip.trigger}>
      <MemoryStick size={14} className="text-[#bba9e5]" />
      <span className="text-[10px] text-[#9696a9]">RAM</span>
      <output
        className="min-w-7.25"
        aria-label="Uso da RAM"
        aria-describedby={tip.describedBy}
      >
        {value.status === 'ready'
          ? `${Math.round(value.data.percent)}%`
          : value.status === 'loading'
            ? '…'
            : 'Erro'}
      </output>
      <span id={tip.describedBy} role="tooltip" className="sr-only">
        {text}
      </span>
    </div>
  )
}
