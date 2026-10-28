import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useEffect, useRef, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Overflowing text travels at 24 px/s with pauses at both ends.
export function ScrollingText({
  text,
  animate = true,
  className,
  ...props
}: Omit<ComponentProps<'span'>, 'children'> & {
  text: string
  animate?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!animate || reducedMotion) return
    const box = viewport.current
    const label = content.current
    if (!box || !label) return
    let animation: Animation | undefined
    const measure = () => {
      animation?.cancel()
      animation = undefined
      const distance = label.scrollWidth - box.clientWidth
      if (distance <= 0 || box.clientWidth === 0) return
      const travel = (distance / 24) * 1000
      const duration = 2 * travel + 2400
      const pause = 1200 / duration
      animation = label.animate?.(
        [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: pause },
          { transform: `translateX(-${distance}px)`, offset: 0.5 },
          { transform: `translateX(-${distance}px)`, offset: 0.5 + pause },
          { transform: 'translateX(0)', offset: 1 }
        ],
        { duration, iterations: Infinity, easing: 'linear' }
      )
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure)
    observer?.observe(box)
    observer?.observe(label)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      animation?.cancel()
      observer?.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [text, animate, reducedMotion])
  return (
    <span
      ref={viewport}
      className={cn(
        'block min-w-0 overflow-hidden whitespace-nowrap',
        (!animate || reducedMotion) && 'text-ellipsis',
        className
      )}
      {...props}
    >
      <span ref={content} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  )
}
