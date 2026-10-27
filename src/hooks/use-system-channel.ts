import { useEffect, useState } from 'react'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import type { Channel } from '../services/system/bridge'

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
  const runtime = useWidgetRuntime()
  const [reading, setReading] = useState(() => ({
    runtime,
    channel,
    event: runtime.initial(channel)
  }))
  useEffect(() => {
    return runtime.subscribe(
      channel,
      { intervalMs, workspaceSource },
      (event) => setReading({ runtime, channel, event }),
      (error) =>
        setReading({
          runtime,
          channel,
          event: { status: 'error', data: null, error: String(error) }
        })
    )
  }, [channel, revision, intervalMs, runtime, workspaceSource])
  return reading.runtime === runtime && reading.channel === channel
    ? reading.event
    : runtime.initial(channel)
}
