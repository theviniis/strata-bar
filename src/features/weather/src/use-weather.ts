import { useEffect, useState } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import {
  bridge,
  connect,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '@/services/system/bridge'
import { widgetPreviewEvent } from '@/services/system/widget-preview'

export function useWeather() {
  const preview = useWidgetPreview()
  const [event, setEvent] = useState<SystemEvent<ChannelData['weather']>>({
    status: 'loading'
  })
  useEffect(() => {
    if (preview || bridge.mode !== 'native') return
    return connect<ChannelData, 'weather'>(
      bridge as NativeBridge,
      'weather',
      { intervalMs: 2000 },
      setEvent,
      (error) => setEvent({ status: 'error', error: String(error) })
    )
  }, [preview])
  return preview ? widgetPreviewEvent('weather') : event
}
