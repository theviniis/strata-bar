import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import { bridge } from '@/services/system/bridge'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaSpectrumData } from '@/services/system/media.generated'
import { MediaSpectrum } from './media-spectrum.widget'

export function MediaSpectrumController() {
  const runtime = useWidgetRuntime()
  const [data, setData] = useState(() => {
    const event = runtime.initial('mediaSpectrum')
    return event.status === 'ready' ? event.data : null
  })
  const latest = useRef(data)
  const bands = useRef<(HTMLSpanElement | null)[]>([])
  const bandRef = useCallback(
    (element: HTMLSpanElement | null, index: number) => {
      bands.current[index] = element
      if (element)
        element.style.transform = `scaleY(${0.05 + (latest.current?.bands[index] ?? 0) * 0.95})`
    },
    []
  )
  useEffect(() => {
    const paint = (next: MediaSpectrumData | null) => {
      const changed = (latest.current !== null) !== (next !== null)
      latest.current = next
      // Frames only change six transforms. React owns availability and motion,
      // not the high-frequency samples; no extra timer or frame is introduced.
      bands.current.forEach((element, index) => {
        if (element) {
          const transform = `scaleY(${0.05 + (next?.bands[index] ?? 0) * 0.95})`
          if (element.style.transform !== transform)
            element.style.transform = transform
        }
      })
      if (changed) setData(next)
    }
    return runtime.subscribe(
      'mediaSpectrum',
      {},
      (event) => paint(event.status === 'ready' ? event.data : null),
      () => paint(null)
    )
  }, [runtime])
  return (
    <MediaSpectrum
      data={data}
      bandRef={bandRef}
      demo={!runtime.interactive || bridge.mode === 'demo'}
    />
  )
}
