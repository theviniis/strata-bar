import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import { useEffect, useMemo, useState } from 'react'
import { timePresentation } from './presentation'

export function useTime() {
  const runtime = useWidgetRuntime()
  const [now, setNow] = useState(runtime.now)
  useEffect(() => runtime.observeTime(setNow, 'minute'), [runtime])
  const time = runtime.interactive ? now : runtime.now()
  return useMemo(() => timePresentation(new Date(time)), [time])
}
