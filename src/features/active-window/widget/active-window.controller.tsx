import type { WidgetView } from '@/components/status-bar/presentation'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { ActiveWindow } from './active-window.widget'

export function ActiveWindowController() {
  const view: WidgetView = useWidgetView()
  const event = useSystemChannel('activeWindow', 0, view.intervalMs)
  return <ActiveWindow event={event} format={view.format} />
}
