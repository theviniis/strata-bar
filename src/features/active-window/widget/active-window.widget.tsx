import { showLabel } from '@/components/status-bar/presentation'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  type WidgetItemProps
} from '@/components/widget-item'
import type { WidgetConfig } from '@/services/configuration/config'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'
import { AppWindow as Icon } from 'lucide-react'

export interface ActiveWindowProps extends WidgetItemProps {
  event: SystemEvent<ChannelData['activeWindow']>
  format: WidgetConfig['format']
  describedBy?: string
}

/**
 * Reads the shared foreground-window channel: whatever window currently has
 * keyboard focus, by title. `loading` means the watcher has no title yet
 * (or the desktop has focus); `ready` carries the title string.
 */
export function ActiveWindow({
  event,
  format,
  describedBy,
  ...triggerProps
}: ActiveWindowProps) {
  const title = event.status === 'ready' ? event.data : undefined
  return (
    <WidgetItem
      aria-label="Janela ativa"
      aria-describedby={describedBy}
      {...triggerProps}
    >
      <WidgetItemIcon icon={Icon} />
      {showLabel(format) && <WidgetItemLabel>Ativa</WidgetItemLabel>}
      <WidgetItemOutput
        aria-label="Título da janela ativa"
        className="max-w-[16rem] truncate"
      >
        {title ?? (event.status === 'loading' ? '...' : '—')}
      </WidgetItemOutput>
    </WidgetItem>
  )
}
