import { WidgetItem, type WidgetItemProps } from '@/components/widget-item'
import type { WidgetConfig } from '@/services/configuration/config'
import type { SystemEvent } from '@/services/system/bridge'
import type {
  NetworkData,
  NetworkUnit
} from '@/services/system/network.generated'
import { MoveDown, MoveUp } from 'lucide-react'
import { NetworkRate } from '../src/network-rate'

export function NetworkWidget({
  event,
  now,
  unit = 'bytes',
  format = 'label',
  direction = 'both',
  ...props
}: WidgetItemProps & {
  event: SystemEvent<NetworkData>
  now: number
  unit?: NetworkUnit
  format?: WidgetConfig['format']
  direction?: WidgetConfig['networkDirection']
}) {
  const data = event.status === 'ready' ? event.data : undefined
  const fresh = data && now - data.sampledAt <= 6000 && !data.error
  return (
    <WidgetItem aria-label="Detalhes da rede" className="gap-2" {...props}>
      {direction !== 'upload' && (
        <NetworkRate
          icon={MoveDown}
          label="Download"
          bytes={fresh ? data.download : null}
          unit={unit}
          format={format}
        />
      )}
      {direction !== 'download' && (
        <NetworkRate
          label="Upload"
          bytes={fresh ? data.upload : null}
          unit={unit}
          format={format}
          icon={MoveUp}
        />
      )}
    </WidgetItem>
  )
}
