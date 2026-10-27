import { useEffect, useState } from 'react'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import {
  bridge,
  type ChannelData,
  type SystemEvent
} from '@/services/system/bridge'

export function useWeather() {
  const runtime = useWidgetRuntime()
  const [event, setEvent] = useState<SystemEvent<ChannelData['weather']>>(() =>
    runtime.initial('weather')
  )
  useEffect(() => {
    if (bridge.mode !== 'native') return
    return runtime.subscribe(
      'weather',
      { intervalMs: 2000 },
      setEvent,
      (error) => setEvent({ status: 'error', error: String(error) })
    )
  }, [runtime])
  return runtime.interactive ? event : runtime.initial('weather')
}
