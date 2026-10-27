import { useEffect, useState } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { widgetPreviewEvent } from '@/services/system/widget-preview'
import {
  bridge,
  connect,
  type Channel,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '../services/system/bridge'

// Feature widgets read native-shaped snapshots. Only the explicit preview
// runtime supplies samples; native errors never select demo scalars.
const native = bridge as NativeBridge

/**
 * `intervalMs` comes from the widget's configured polling cadence; changing it
 * re-subscribes through the same idempotent dispose path, so the widget is
 * never remounted and keeps its rendered identity across a config apply.
 */
export function useSystemChannel<C extends Channel>(
  channel: C,
  revision = 0,
  intervalMs = 2000,
  workspaceSource?: 'komorebi' | 'windows'
) {
  const preview = useWidgetPreview()
  const [value, setValue] = useState<SystemEvent<ChannelData[C]>>({
    status: 'loading',
    data: null
  })
  useEffect(() => {
    if (preview) return
    return connect<ChannelData, C>(
      native,
      channel,
      { intervalMs, workspaceSource },
      setValue,
      (error) => setValue({ status: 'error', data: null, error: String(error) })
    )
  }, [channel, revision, intervalMs, preview, workspaceSource])
  return preview ? widgetPreviewEvent(channel) : value
}
