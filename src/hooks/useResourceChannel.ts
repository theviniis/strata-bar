import { useEffect, useState } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import {
  PREVIEW_TIME,
  widgetPreviewEvent
} from '@/services/system/widget-preview'
import {
  bridge,
  connect,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '@/services/system/bridge'

/** Resource channels share retention and freshness behavior across bar and popup. */
export function useResourceChannel<C extends 'cpu' | 'gpu' | 'memory' | 'disk'>(
  channel: C,
  intervalMs = 2000
) {
  const preview = useWidgetPreview()
  const [reading, setReading] = useState<{
    channel: C
    event: SystemEvent<ChannelData[C]>
    lastData?: ChannelData[C]
  }>({ channel, event: { status: 'loading' } })
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (preview) return
    return connect<ChannelData, C>(
      bridge as NativeBridge,
      channel,
      { intervalMs },
      (event) =>
        setReading((previous) => ({
          channel,
          event,
          lastData:
            event.status === 'ready'
              ? event.data
              : previous.channel === channel
                ? previous.lastData
                : undefined
        })),
      (error) =>
        setReading((previous) => ({
          channel,
          lastData:
            previous.channel === channel ? previous.lastData : undefined,
          event: { status: 'error', error: String(error) }
        }))
    )
  }, [channel, intervalMs, preview])
  useEffect(() => {
    if (preview) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [preview])
  if (preview)
    return {
      event: widgetPreviewEvent(channel),
      lastData: undefined,
      now: PREVIEW_TIME
    }
  return {
    ...(reading.channel === channel
      ? reading
      : { event: { status: 'loading' as const }, lastData: undefined }),
    now
  }
}
