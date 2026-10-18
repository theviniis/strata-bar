import { useEffect, useState } from 'react'
import {
  bridge,
  connect,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '@/services/system/bridge'

/** Resource channels share retention and freshness behavior across bar and popup. */
export function useResourceChannel<C extends 'cpu' | 'gpu' | 'memory'>(
  channel: C
) {
  const [reading, setReading] = useState<{
    channel: C
    event: SystemEvent<ChannelData[C]>
    lastData?: ChannelData[C]
  }>({ channel, event: { status: 'loading' } })
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    return connect<ChannelData, C>(
      bridge as NativeBridge,
      channel,
      { intervalMs: 2000 },
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
  }, [channel])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return {
    ...(reading.channel === channel
      ? reading
      : { event: { status: 'loading' as const }, lastData: undefined }),
    now
  }
}
