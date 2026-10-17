import { MemoryStick } from 'lucide-react'
import { useSystemChannel } from '../../hooks/useSystemChannel'

export function Memory() {
  const value = useSystemChannel('memory')
  const title =
    value.status === 'error'
      ? value.error
      : value.status === 'ready'
        ? `${(value.data.usedBytes / 1073741824).toFixed(1)} / ${(value.data.totalBytes / 1073741824).toFixed(1)} GiB`
        : 'Carregando RAM'
  return (
    <div className="bar-metric" title={title}>
      <MemoryStick size={14} />
      <span>RAM</span>
      <output aria-label="Uso da RAM">
        {value.status === 'ready'
          ? `${Math.round(value.data.percent)}%`
          : value.status === 'loading'
            ? '…'
            : 'Erro'}
      </output>
    </div>
  )
}
