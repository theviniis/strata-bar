import { useAnimate } from 'motion/react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pin, PinOff, X } from 'lucide-react'
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
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
  popupOpenKeyframes,
  popupTransformKeyframes
} from './motion'

export interface PopupSurfaceProps {
  label: string
  pinned?: boolean
  pinnable?: boolean
  onPinChange?(pinned: boolean): void
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
  pinned = false,
  pinnable = true,
  onPinChange,
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
  const initialSide = useRef(side)
  const initialPinned = useRef(pinned)
  const opened = useRef(false)
  const openingAcknowledged = useRef(false)
  const acknowledgeOpening = useCallback(() => {
    if (mode !== 'native' || !session || openingAcknowledged.current) return
    openingAcknowledged.current = true
    void overlay.opened?.(session).catch(console.error)
  }, [mode, session])
  const root = useRef<HTMLDivElement>(null)
  const [pinError, setPinError] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const drag = useRef<{
    x: number
    y: number
    left: number
    top: number
  } | null>(null)
  const surface = useRef<HTMLDivElement>(null)
  const [visual, animate] = useAnimate<HTMLDivElement>()
  const exitCallback = useRef(onExited)
  const closingRef = useRef(closing)
  const targetSize = useRef(anchorSize)
  const openingFrame = useRef<number | undefined>(undefined)
  const motion = useRef<ReturnType<typeof animate> | undefined>(undefined)
  const arrowInput = useRef(arrowX)
  const [measuredArrowX, setPlacedArrowX] = useState({
    input: arrowX,
    value: arrowX
  })
  const placedArrowX =
    measuredArrowX.input === arrowX ? measuredArrowX.value : arrowX
  useLayoutEffect(() => {
    arrowInput.current = arrowX
  }, [arrowX])
  useLayoutEffect(() => {
    exitCallback.current = onExited
    closingRef.current = closing
    targetSize.current = anchorSize ?? targetSize.current
  }, [onExited, closing, anchorSize])
  useLayoutEffect(() => {
    const node = surface.current
    let cancelled = false
    const side = initialSide.current
    const enabled = popupMotionEnabled() && !initialPinned.current
    const hidden = {
      opacity: 0,
      transform: `translateY(${side === 'bottom' ? -POPUP_GAP : POPUP_GAP}px) scale(0.18, 0.08)`,
      filter: 'blur(0px)',
      clipPath: 'inset(0px round 160px)'
    }
    if (enabled && visual.current) {
      motion.current = animate(visual.current, hidden, { duration: 0 })
      motion.current.complete()
    }
    const animateOpen = () => {
      if (!enabled || opened.current) return
      openingFrame.current = requestAnimationFrame(() => {
        openingFrame.current = requestAnimationFrame(() => {
          if (closingRef.current || opened.current || !visual.current) return
          motion.current = animate(
            visual.current,
            popupTransformKeyframes(
              popupOpenKeyframes(
                side,
                node!.getBoundingClientRect(),
                targetSize.current
              )
            ),
            {
              duration: POPUP_ENTER_MS / 1000,
              ease: POPUP_ENTER_EASE,
              opacity: { duration: 0.12, ease: 'easeOut' }
            }
          )
          void motion.current.then(() => {
            if (cancelled || closingRef.current || opened.current) return
            opened.current = true
            // Release the opening silhouette so the resting arrow and glass
            // surface are no longer clipped after the capsule expands.
            if (visual.current)
              animate(
                visual.current,
                { clipPath: 'none' },
                { duration: 0 }
              ).complete()
            acknowledgeOpening()
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
      if (closingRef.current) return
      const rect = node.getBoundingClientRect()
      const size = {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height)
      }
      const key = `${size.width}:${size.height}`
      if (size.width <= 0 || size.height <= 0 || key === previous) return
      previous = key
      const current = ++generation
      const input = arrowInput.current
      void overlay
        .resize(session, size)
        .then((size) => {
          if (cancelled || closingRef.current || generation !== current) return
          targetSize.current = size.anchorSize ?? targetSize.current
          setPlacedArrowX({ input, value: size.arrowX })
          if (!focused) {
            focused = true
            if (autoFocus && !opened.current) root.current?.focus()
            animateOpen()
            if (!enabled) {
              opened.current = true
              acknowledgeOpening()
            }
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
  }, [mode, session, autoFocus, animate, visual, acknowledgeOpening])
  useLayoutEffect(() => {
    if (!pinned || opened.current || !visual.current) return
    if (openingFrame.current !== undefined)
      cancelAnimationFrame(openingFrame.current)
    motion.current?.stop()
    opened.current = true
    animate(
      visual.current,
      {
        opacity: 1,
        transform: 'translateY(0px) scale(1, 1)',
        filter: 'blur(0px)',
        clipPath: 'none'
      },
      { duration: 0 }
    ).complete()
    // Let the settled pin paint before the host starts preparing another view.
    openingFrame.current = requestAnimationFrame(() => {
      openingFrame.current = requestAnimationFrame(acknowledgeOpening)
    })
  }, [pinned, animate, visual, acknowledgeOpening])
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
    const rounding =
      !pinned && root.current
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
      pinned
        ? {
            opacity: [null, 0],
            transform: [null, 'translateY(0px) scale(0.96, 0.96)']
          }
        : popupTransformKeyframes(
            popupDockKeyframes(side, rect, targetSize.current)
          ),
      pinned
        ? { duration: 0.15, ease: 'easeOut' }
        : {
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
  }, [closing, side, pinned, animate, visual])
  return (
    <div
      ref={surface}
      className="w-max"
      style={
        mode === 'demo' && pinned
          ? { transform: `translate(${offset.x}px, ${offset.y}px)` }
          : undefined
      }
      inert={closing || undefined}
    >
      <div
        ref={visual}
        className="relative will-change-[transform,opacity]"
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
            'rounded-2xl bg-popover glass-surface backdrop-blur-lg text-body shadow-none outline-none *:max-w-full',
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
          {pinnable && (
            <div
              data-popup-drag-handle={pinned || undefined}
              className={cn(
                'flex items-center gap-2 px-3 py-1 select-none',
                pinned && 'cursor-move touch-none'
              )}
              onPointerDown={(event) => {
                if (
                  !pinned ||
                  event.button !== 0 ||
                  (event.target as HTMLElement).closest(
                    'button, input, a, select, textarea'
                  )
                )
                  return
                if (mode === 'native' && session) {
                  void overlay
                    .drag?.(session)
                    .catch((error: unknown) => setPinError(String(error)))
                } else {
                  drag.current = {
                    x: event.clientX,
                    y: event.clientY,
                    left: offset.x,
                    top: offset.y
                  }
                  event.currentTarget.setPointerCapture(event.pointerId)
                }
              }}
              onPointerMove={(event) => {
                if (!drag.current) return
                setOffset({
                  x: drag.current.left + event.clientX - drag.current.x,
                  y: drag.current.top + event.clientY - drag.current.y
                })
              }}
              onPointerUp={() => {
                drag.current = null
              }}
              onPointerCancel={() => {
                drag.current = null
              }}
            >
              <span className="flex-1 truncate text-muted-foreground">
                {label}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={pinned ? 'Desafixar popup' : 'Fixar popup'}
                aria-pressed={pinned}
                disabled={transferring}
                onClick={() => {
                  setPinError('')
                  if (mode === 'demo') {
                    onPinChange?.(!pinned)
                    setOffset({ x: 0, y: 0 })
                    return
                  }
                  if (!session || !overlay.pin) return
                  setTransferring(true)
                  void overlay
                    .pin(session, !pinned)
                    .catch((error: unknown) => setPinError(String(error)))
                    .finally(() => setTransferring(false))
                }}
              >
                {pinned ? <PinOff /> : <Pin />}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Fechar popup"
                disabled={transferring}
                onClick={close}
              >
                <X />
              </Button>
            </div>
          )}
          {pinError && (
            <p role="alert" className="px-3 text-destructive">
              {pinError}
            </p>
          )}
          {children}
        </Card>
        {!pinned && (
          <span
            aria-hidden="true"
            style={{
              left: (mode === 'native' ? placedArrowX : arrowX) ?? '50%'
            }}
            className={cn(
              tooltipArrowClasses,
              'pointer-events-none absolute -translate-x-1/2 bg-popover backdrop-blur-lg',
              side === 'bottom' ? 'top-1.75' : 'bottom-1.75'
            )}
          />
        )}
      </div>
    </div>
  )
}
