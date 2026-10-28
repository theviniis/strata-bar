import { useEffect, useState } from 'react'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import type { ChannelData, SystemEvent } from '@/services/system/bridge'

/** Resource channels share retention and freshness behavior across bar and popup. */
export function useResourceChannel<
  C extends 'cpu' | 'gpu' | 'memory' | 'disk' | 'network'
>(channel: C, intervalMs = 2000) {
  const runtime = useWidgetRuntime()
  const [reading, setReading] = useState<{
    channel: C
    event: SystemEvent<ChannelData[C]>
    lastData?: ChannelData[C]
  }>({ channel, event: { status: 'loading' } })
  const [now, setNow] = useState(runtime.now)
  useEffect(() => {
    return runtime.subscribe(
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
  }, [channel, intervalMs, runtime])
  useEffect(() => runtime.observeTime(setNow, 1000), [runtime])
  if (!runtime.interactive)
    return {
      event: runtime.initial(channel),
      lastData: undefined,
      now: runtime.now()
    }
  return {
    ...(reading.channel === channel
      ? reading
      : { event: { status: 'loading' as const }, lastData: undefined }),
    now
  }
}
