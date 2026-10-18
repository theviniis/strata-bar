import { Cpu as Icon } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'

export function Cpu() {
  const value = useSystemChannel('cpu')
  const text =
    value.status === 'error'
      ? value.error
      : 'Uso total de CPU · amostra a cada 2 segundos'
  const tip = useOverlayTooltip(text)
  return (
    <div className="flex min-w-0 items-center gap-2" {...tip.trigger}>
      <Icon size={14} className="text-[#bba9e5]" />
      <span className="text-[10px] text-[#9696a9]">CPU</span>
      <output
        className="min-w-7.25"
        aria-label="Uso da CPU"
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
