import { Cpu as Icon } from 'lucide-react'
import { useSystemChannel } from '../../hooks/useSystemChannel'
export function Cpu() {
  const value = useSystemChannel('cpu')
  return (
    <div
      className="bar-metric"
      title={value.error || 'Uso total de CPU · amostra a cada 2 segundos'}
    >
      <Icon size={14} />
      <span>CPU</span>
      <output aria-label="Uso da CPU">
        {value.status === 'ready'
          ? `${Math.round(value.data.percent)}%`
          : value.status === 'loading'
            ? '…'
            : 'Erro'}
      </output>
    </div>
  )
}
