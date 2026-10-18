import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { renderOutput } from '@/lib/utils'
import type { SystemEvent } from '@/services/system/bridge'
import { MemoryStick } from 'lucide-react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'
import { useSystemChannel } from '../../hooks/useSystemChannel'

type RamValue = SystemEvent<{
  percent: number
  usedBytes: number
  totalBytes: number
}>

const mapRamStatusToText = (value: RamValue) => {
  if (value.status === 'error') {
    return value.error
  }

  if (value.status === 'ready') {
    const usedGiB = (value.data.usedBytes / 1073741824).toFixed(1)
    const totalGiB = (value.data.totalBytes / 1073741824).toFixed(1)
    return `${usedGiB} / ${totalGiB} GiB`
  }

  return 'Carregando RAM'
}

export function Memory() {
  const value = useSystemChannel('memory')
  const text = mapRamStatusToText(value)
  const tip = useOverlayTooltip(text)

  return (
    <WidgetItem {...tip.trigger}>
      <WidgetItemIcon icon={MemoryStick} />
      <WidgetItemLabel>RAM</WidgetItemLabel>
      <WidgetItemOutput
        aria-label="Uso da RAM"
        aria-describedby={tip.describedBy}
      >
        {renderOutput(value)}
      </WidgetItemOutput>
      <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
    </WidgetItem>
  )
}
