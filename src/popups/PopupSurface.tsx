import { useEffect, useRef, useState, type ReactNode } from 'react'
import { tooltipArrowClasses } from '../components/ui/tooltip-classes'
import { cn } from '../lib/utils'
import { overlay, type OverlaySide } from '../services/system/overlay'
import { POPUP_GAP } from './catalog'

export interface PopupSurfaceProps {
  label: string
  maxHeight: number
  mode: 'native' | 'demo'
  session?: string
  side?: OverlaySide
  arrowX?: number
  close(): void
  children: ReactNode
}

/** Owns window mechanics only. Feature content is unrestricted React. */
export function PopupSurface({
  label,
  maxHeight,
  mode,
  session,
  side = 'bottom',
  arrowX,
  close,
  children
}: PopupSurfaceProps) {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const visual = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState(maxHeight)
  useEffect(() => {
    const node = surface.current
    let animation: Animation | undefined
    let frame: number | undefined
    const animateOpen = () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
        return
      frame = requestAnimationFrame(() => {
        animation = visual.current?.animate?.(
          [
            {
              opacity: 0,
              transform: `translateY(${side === 'bottom' ? -4 : 4}px)`
            },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 160, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        )
      })
    }
    const stopAnimation = () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      animation?.cancel()
    }
    if (mode === 'demo') {
      root.current?.focus()
      animateOpen()
      return stopAnimation
    }
    if (!session || !node) return
    let cancelled = false
    let previous = 0
    let generation = 0
    let focused = false
    const measure = () => {
      const height = Math.ceil(node.getBoundingClientRect().height)
      if (height <= 0 || height === previous) return
      previous = height
      const current = ++generation
      void overlay
        .resize(session, height)
        .then((size) => {
          if (cancelled || generation !== current) return
          setAvailable(Math.min(maxHeight, size.maxHeight))
          if (!focused) {
            focused = true
            root.current?.focus()
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
  }, [mode, session, maxHeight, side])
  return (
    <div ref={surface}>
      <div
        ref={visual}
        className="relative"
        style={
          side === 'bottom'
            ? { paddingTop: POPUP_GAP }
            : { paddingBottom: POPUP_GAP }
        }
      >
        <div
          ref={root}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          style={{
            maxHeight:
              mode === 'demo'
                ? `min(${maxHeight - POPUP_GAP}px, calc(var(--radix-popover-content-available-height, 100vh) - ${POPUP_GAP}px))`
                : Math.max(1, available - POPUP_GAP)
          }}
          className="overflow-y-auto rounded-xl border border-border bg-popover p-3 text-[12px] text-popover-foreground shadow-lg outline-none group-data-[theme=light]:border-[#ded7e5] group-data-[theme=light]:bg-[#faf8fc] group-data-[theme=light]:text-[#302a3e]"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
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
        </div>
        <span
          aria-hidden="true"
          style={{ left: arrowX ?? '50%' }}
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
