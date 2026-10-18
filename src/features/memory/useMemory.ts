import { useEffect, useState } from 'react'
import {
  bridge,
  connect,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '@/services/system/bridge'
import type { MemoryData } from '@/services/system/memory.generated'

export function useMemory() {
  const [reading, setReading] = useState<{
    event: SystemEvent<MemoryData>
    lastData?: MemoryData
  }>({ event: { status: 'loading' } })
  const [now, setNow] = useState(Date.now)
  useEffect(
    () =>
      connect<ChannelData, 'memory'>(
        bridge as NativeBridge,
        'memory',
        { intervalMs: 2000 },
        (event) =>
          setReading((previous) => ({
            event,
            lastData: event.status === 'ready' ? event.data : previous.lastData
          })),
        (error) =>
          setReading((previous) => ({
            ...previous,
            event: { status: 'error', error: String(error) }
          }))
      ),
    []
  )
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  return { ...reading, now }
}
