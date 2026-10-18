import { useEffect, useState } from 'react'
import {
  bridge,
  connect,
  type ChannelData,
  type NativeBridge,
  type SystemEvent
} from '@/services/system/bridge'
import type { CpuData } from '@/services/system/cpu.generated'
export function useCpu() {
  const [reading, setReading] = useState<{
    event: SystemEvent<CpuData>
    lastData?: CpuData
  }>({ event: { status: 'loading' } })
  const [now, setNow] = useState(Date.now)
  useEffect(
    () =>
      connect<ChannelData, 'cpu'>(
        bridge as NativeBridge,
        'cpu',
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
