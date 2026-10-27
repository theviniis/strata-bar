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
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!animate) return
    const box = viewport.current
    const label = content.current
    if (!box || !label) return
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let animation: Animation | undefined
    const measure = () => {
      animation?.cancel()
      animation = undefined
      const distance = label.scrollWidth - box.clientWidth
      if (distance <= 0 || box.clientWidth === 0 || motion?.matches) return
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
    motion?.addEventListener?.('change', measure)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      animation?.cancel()
      observer?.disconnect()
      motion?.removeEventListener?.('change', measure)
      window.removeEventListener('resize', measure)
    }
  }, [text, animate])
  return (
    <span
      ref={viewport}
      className={cn(
        'block min-w-0 overflow-hidden whitespace-nowrap motion-reduce:text-ellipsis',
        !animate && 'text-ellipsis',
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
