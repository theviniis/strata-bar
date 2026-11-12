import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useLayoutEffect, useRef } from 'react'

const SCROLL_PIXELS_PER_SECOND = 20
// Each leg occupies 38% of the CSS cycle, with pauses at both ends.
const TRAVEL_FRACTION = 0.38

export function TrackTitle({
  text,
  animate,
  describedBy
}: {
  text: string
  animate: boolean
  describedBy?: string
}) {
  const reducedMotion = useReducedMotion()
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    if (!animate || reducedMotion) return
    const box = viewport.current
    const label = content.current
    if (!box || !label) return

    const clear = () => {
      label.style.removeProperty('--track-title-offset')
      label.style.removeProperty('animation')
    }
    const measure = () => {
      const width = box.clientWidth
      const overflow = label.scrollWidth - width
      if (!width || overflow <= 0) {
        clear()
        return
      }

      const travelSeconds = overflow / SCROLL_PIXELS_PER_SECOND
      const duration = Math.max(
        2200,
        Math.round((travelSeconds / TRAVEL_FRACTION) * 1000)
      )
      label.style.setProperty('--track-title-offset', `${-overflow}px`)
      label.style.animation = `strata-track-title ${duration}ms linear infinite`
    }

    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure)
    observer?.observe(box)
    observer?.observe(label)
    measure()
    return () => {
      observer?.disconnect()
      clear()
    }
  }, [animate, reducedMotion, text])

  return (
    <span
      ref={viewport}
      aria-describedby={describedBy}
      className="relative z-10 mx-1 block min-w-0 flex-1 overflow-hidden whitespace-nowrap text-bar"
    >
      <span ref={content} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  )
}
