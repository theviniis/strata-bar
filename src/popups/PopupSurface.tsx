import { useAnimate } from 'motion/react'
import { Card } from '@/components/ui/card'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { tooltipArrowClasses } from '../components/ui/tooltip-classes'
import { cn } from '../lib/utils'
import { overlay, type OverlaySide } from '../services/system/overlay'
import { POPUP_GAP } from './constants'
import {
  POPUP_ENTER_MS,
  POPUP_ENTER_EASE,
  POPUP_EXIT_MS,
  popupMotionEnabled,
  popupDockKeyframes,
  popupOpenKeyframes
} from './motion'

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
  onExited?(): void
  anchorSize?: { width: number; height: number }
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
  onExited,
  anchorSize,
  close,
  children
}: PopupSurfaceProps) {
  const root = useRef<HTMLDivElement>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [visual, animate] = useAnimate<HTMLDivElement>()
  const exitCallback = useRef(onExited)
  const closingRef = useRef(closing)
  const targetSize = useRef(anchorSize)
  const openingFrame = useRef<number | undefined>(undefined)
  const motion = useRef<ReturnType<typeof animate> | undefined>(undefined)
  const [placedArrowX, setPlacedArrowX] = useState(arrowX)
  useLayoutEffect(() => {
    exitCallback.current = onExited
    closingRef.current = closing
    targetSize.current = anchorSize ?? targetSize.current
  }, [onExited, closing, anchorSize])
  useLayoutEffect(() => {
    const node = surface.current
    let cancelled = false
    const enabled = popupMotionEnabled()
    const hidden = {
      opacity: 0,
      y: side === 'bottom' ? -POPUP_GAP : POPUP_GAP,
      scaleX: 0.18,
      scaleY: 0.08,
      filter: 'blur(0px)',
      clipPath: 'inset(0px round 160px)'
    }
    if (enabled && visual.current) {
      motion.current = animate(visual.current, hidden, { duration: 0 })
      motion.current.complete()
    }
    const animateOpen = () => {
      if (!enabled) return
      openingFrame.current = requestAnimationFrame(() => {
        openingFrame.current = requestAnimationFrame(() => {
          if (closingRef.current || !visual.current) return
          motion.current = animate(
            visual.current,
            popupOpenKeyframes(
              side,
              node!.getBoundingClientRect(),
              targetSize.current
            ),
            {
              duration: POPUP_ENTER_MS / 1000,
              ease: POPUP_ENTER_EASE,
              opacity: { duration: 0.12, ease: 'easeOut' }
            }
          )
          void motion.current.then(() => {
            // Restore the resting shadow and arrow after the capsule opens.
            if (!cancelled && !closingRef.current && visual.current)
              animate(
                visual.current,
                { clipPath: 'none' },
                { duration: 0 }
              ).complete()
          })
        })
      })
    }
    const stopAnimation = () => {
      cancelled = true
      if (openingFrame.current !== undefined)
        cancelAnimationFrame(openingFrame.current)
      motion.current?.stop()
    }
    if (mode === 'demo') {
      if (autoFocus) root.current?.focus()
      animateOpen()
      return stopAnimation
    }
    if (!session || !node) return stopAnimation
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
          targetSize.current = size.anchorSize ?? targetSize.current
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
  }, [mode, session, side, autoFocus, animate, visual])
  useLayoutEffect(() => {
    const node = visual.current
    if (!closing || !node) return
    if (openingFrame.current !== undefined)
      cancelAnimationFrame(openingFrame.current)
    motion.current?.stop()
    let cancelled = false
    if (!popupMotionEnabled()) {
      exitCallback.current?.()
      return
    }
    animate(node, { clipPath: 'none' }, { duration: 0 }).complete()
    const rect = surface.current!.getBoundingClientRect()
    const rounding = root.current
      ? animate(
          root.current,
          { borderRadius: [null, '48px', '96px', '160px'] },
          {
            duration: POPUP_EXIT_MS / 1000,
            times: [0, 0.4, 0.76, 1],
            ease: 'easeInOut'
          }
        )
      : undefined
    const exit = animate(
      node,
      popupDockKeyframes(side, rect, targetSize.current),
      {
        duration: POPUP_EXIT_MS / 1000,
        times: [0, 0.4, 0.76, 1],
        ease: [
          [0.32, 0, 0.67, 0],
          [0.2, 0.65, 0.3, 1],
          [0.4, 0, 1, 1]
        ]
      }
    )
    motion.current = exit
    void exit.then(() => {
      if (!cancelled) exitCallback.current?.()
    })
    return () => {
      cancelled = true
      rounding?.stop()
      exit.stop()
    }
  }, [closing, side, animate, visual])
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
            'rounded-2xl bg-popover glass-surface backdrop-blur-lg text-body font-normal shadow-none outline-none *:max-w-full',
            closing && 'overflow-hidden',
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
            'pointer-events-none absolute -translate-x-1/2 bg-popover backdrop-blur-lg',
            side === 'bottom' ? 'top-1.75' : 'bottom-1.75'
          )}
        />
      </div>
    </div>
  )
}
