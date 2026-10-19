import { Card } from '@/components/ui/card'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { tooltipArrowClasses } from '../components/ui/tooltip-classes'
import { cn } from '../lib/utils'
import { overlay, type OverlaySide } from '../services/system/overlay'
import { POPUP_GAP } from './constants'
import { POPUP_EXIT_MS } from './motion'

export interface PopupSurfaceProps {
  label: string
  className?: string
  mode: 'native' | 'demo'
  session?: string
  side?: OverlaySide
  arrowX?: number
  closing?: boolean
  closeOnEscape?: boolean
  autoFocus?: boolean
  close(): void
  children: ReactNode
}

/** Owns window mechanics only. Feature content is unrestricted React. */
export function PopupSurface({
  label,
  className,
  mode,
  session,
  side = 'bottom',
  arrowX,
  closing = false,
  closeOnEscape = true,
  autoFocus = true,
  close,
  children
}: PopupSurfaceProps) {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const visual = useRef<HTMLDivElement>(null)
  const openingFrame = useRef<number | undefined>(undefined)
  const motion = useRef<Animation | undefined>(undefined)
  const [placedArrowX, setPlacedArrowX] = useState(arrowX)
  useLayoutEffect(() => {
    const node = surface.current
    let animation: Animation | undefined
    // Prepare before the native window is revealed, so its first paint is
    // already transparent. Layout measurements use the untransformed wrapper.
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      animation = visual.current?.animate?.(
        [
          {
            opacity: 0,
            transform: `translateY(${side === 'bottom' ? -POPUP_GAP : POPUP_GAP}px) scale(0.12, 0.04)`,
            borderRadius: '32px',
            filter: 'blur(3px)'
          },
          {
            opacity: 1,
            transform: 'translateY(0) scale(1)',
            borderRadius: '12px',
            filter: 'blur(0px)'
          }
        ],
        {
          duration: 420,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          fill: 'both'
        }
      )
      motion.current = animation
      animation?.pause()
      if (animation) animation.currentTime = 0
    }
    const animateOpen = () => {
      if (!animation) return
      // A resize reply can precede WebView presentation. Give the visible
      // window a frame before advancing the prepared animation.
      openingFrame.current = requestAnimationFrame(() => {
        openingFrame.current = requestAnimationFrame(() => animation?.play())
      })
    }
    const stopAnimation = () => {
      if (openingFrame.current !== undefined)
        cancelAnimationFrame(openingFrame.current)
      animation?.cancel()
    }
    if (mode === 'demo') {
      if (autoFocus) root.current?.focus()
      animateOpen()
      return stopAnimation
    }
    if (!session || !node) return
    let cancelled = false
    let previous = ''
    let generation = 0
    let focused = false
    const measure = () => {
      const rect = node.getBoundingClientRect()
      const size = {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      }
      const key = `${size.width}:${size.height}`
      if (size.width <= 0 || size.height <= 0 || key === previous) return
      previous = key
      const current = ++generation
      void overlay
        .resize(session, size)
        .then((size) => {
          if (cancelled || generation !== current) return
          setPlacedArrowX(size.arrowX)
          if (!focused) {
            focused = true
            if (autoFocus) root.current?.focus()
            animateOpen()
          }
        })
        .catch((error) => {
          if (!cancelled) console.error('Popup resize', error)
        })
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure)
    observer?.observe(node)
    measure()
    return () => {
      cancelled = true
      stopAnimation()
      observer?.disconnect()
    }
  }, [mode, session, side, autoFocus])
  useLayoutEffect(() => {
    const node = visual.current
    if (
      !closing ||
      !node ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    )
      return
    if (openingFrame.current !== undefined)
      cancelAnimationFrame(openingFrame.current)
    const current = getComputedStyle(node)
    const start = {
      opacity: current.opacity,
      transform: current.transform,
      filter: current.filter
    }
    motion.current?.cancel()
    const exit = node.animate?.(
      [
        start,
        {
          opacity: 0,
          transform: `translateY(${side === 'bottom' ? -POPUP_GAP : POPUP_GAP}px) scale(0.12, 0.04)`,
          filter: 'blur(3px)'
        }
      ],
      {
        duration: POPUP_EXIT_MS,
        easing: 'cubic-bezier(0.4, 0, 0.7, 0.2)',
        fill: 'forwards'
      }
    )
    return () => exit?.cancel()
  }, [closing, side])
  return (
    <div ref={surface} className="w-max" inert={closing || undefined}>
      <div
        ref={visual}
        className="relative"
        style={
          side === 'bottom'
            ? {
                paddingTop: POPUP_GAP,
                transformOrigin: `${(mode === 'native' ? placedArrowX : arrowX) ?? '50%'}${typeof (mode === 'native' ? placedArrowX : arrowX) === 'number' ? 'px' : ''} 0%`
              }
            : {
                paddingBottom: POPUP_GAP,
                transformOrigin: `${(mode === 'native' ? placedArrowX : arrowX) ?? '50%'}${typeof (mode === 'native' ? placedArrowX : arrowX) === 'number' ? 'px' : ''} 100%`
              }
        }
      >
        <Card
          ref={root}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className={cn(
            'max-w-90 bg-popover text-[12px] shadow-lg outline-none *:max-w-full',
            className
          )}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (closeOnEscape) close()
            }
            if (event.key !== 'Tab') return
            const controls = root.current?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
            )
            if (!controls?.length) {
              event.preventDefault()
              return
            }
            const first = controls[0],
              last = controls[controls.length - 1]
            if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === root.current)
            ) {
              event.preventDefault()
              last.focus()
            } else if (
              !event.shiftKey &&
              (document.activeElement === last ||
                document.activeElement === root.current)
            ) {
              event.preventDefault()
              first.focus()
            }
          }}
        >
          {children}
        </Card>
        <span
          aria-hidden="true"
          style={{ left: (mode === 'native' ? placedArrowX : arrowX) ?? '50%' }}
          className={cn(
            tooltipArrowClasses,
            'pointer-events-none absolute -translate-x-1/2 border-border group-data-[theme=light]:border-[#ded7e5] group-data-[theme=light]:bg-[#faf8fc]',
            side === 'bottom'
              ? 'top-1.75 border-t border-l'
              : 'bottom-1.75 border-r border-b'
          )}
        />
      </div>
    </div>
  )
}
