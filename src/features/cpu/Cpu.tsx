import { Cpu as Icon } from 'lucide-react'
import { useSystemChannel } from '../../hooks/useSystemChannel'

export function Cpu() {
  const value = useSystemChannel('cpu')
  return (
    <div
      className="flex min-w-0 items-center gap-[8px]"
      title={
        value.status === 'error'
          ? value.error
          : 'Uso total de CPU · amostra a cada 2 segundos'
      }
    >
      <Icon size={14} className="text-[#bba9e5]" />
      <span className="text-[10px] text-[#9696a9]">CPU</span>
      <output className="min-w-[29px]" aria-label="Uso da CPU">
        {value.status === 'ready'
          ? `${Math.round(value.data.percent)}%`
          : value.status === 'loading'
            ? '…'
            : 'Erro'}
      </output>
    </div>
  )
}
