import { Slot } from '@radix-ui/react-slot'
import { motion, useReducedMotion, type SpringOptions } from 'motion/react'
import { cn } from '@/lib/utils'
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type PointerEvent
} from 'react'
import { createPortal } from 'react-dom'

interface HighlightRect {
  left: number
  top: number
  width: number
  height: number
}

export interface SlidingHighlightProps {
  /** One DOM element that contains the items and receives positioning styles. */
  children: ReactElement
  /** Background and radius classes for the decorative highlight. */
  highlightClassName?: string
  /** Physics of travel between items. The first hover appears in place. */
  spring?: Pick<SpringOptions, 'stiffness' | 'damping' | 'mass'>
}

/** A single Motion background follows descendants marked data-sliding-highlight-item.
 * Uses measured geometry to support WebView2, variable widths and scaled previews.
 * Inspired by https://codepen.io/jh3y/pen/qEbVOMm.
 */
export function SlidingHighlight({
  children,
  highlightClassName,
  spring
}: SlidingHighlightProps) {
  const reducedMotion = useReducedMotion()
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [highlight, setHighlight] = useState<{
    rect: HighlightRect | null
    visible: boolean
    moving: boolean
  }>({ rect: null, visible: false, moving: false })
  const active = useRef<HTMLElement | null>(null)
  const measure = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    if (!container) return
    const update = () => {
      const target = active.current
      if (!target || !container.contains(target)) {
        active.current = null
        setHighlight((old) => ({ ...old, visible: false }))
        return
      }
      const bounds = container.getBoundingClientRect()
      const item = target.getBoundingClientRect()
      const scaleX = container.offsetWidth
        ? bounds.width / container.offsetWidth
        : 1
      const scaleY = container.offsetHeight
        ? bounds.height / container.offsetHeight
        : 1
      const rect = {
        left:
          (item.left - bounds.left) / scaleX -
          container.clientLeft +
          container.scrollLeft,
        top:
          (item.top - bounds.top) / scaleY -
          container.clientTop +
          container.scrollTop,
        width: item.width / scaleX,
        height: item.height / scaleY
      }
      setHighlight((old) => ({
        rect,
        visible: true,
        moving: old.visible || old.moving
      }))
    }
    measure.current = update
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(update)
    observer?.observe(container)
    // Content and responsive layout can change the hovered item's size.
    const mutation = new MutationObserver(() => {
      if (active.current) update()
    })
    mutation.observe(container, {
      childList: true,
      subtree: true,
      characterData: true
    })
    window.addEventListener('resize', update)
    return () => {
      measure.current = undefined
      observer?.disconnect()
      mutation.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [container])

  const leave = (reset = true) => {
    active.current = null
    setHighlight((old) => ({
      ...old,
      visible: false,
      moving: !reset && (old.visible || old.moving)
    }))
  }
  return (
    <>
      <Slot
        ref={setContainer}
        data-sliding-highlight-group=""
        className="relative isolate"
        onPointerMove={(event: PointerEvent<HTMLElement>) => {
          if (event.pointerType === 'touch') return
          const target =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>(
                  '[data-sliding-highlight-item]'
                )
              : null
          if (
            !target ||
            !event.currentTarget.contains(target) ||
            target.closest('[data-sliding-highlight-group]') !== container ||
            target.closest('[inert]') ||
            target.matches(':disabled, [aria-disabled="true"]')
          ) {
            if (active.current) leave(false)
            return
          }
          if (target !== active.current) {
            active.current = target
            measure.current?.()
          }
        }}
        onPointerLeave={() => leave()}
        onPointerCancel={() => leave()}
      >
        {children}
      </Slot>
      {container &&
        createPortal(
          <motion.span
            aria-hidden="true"
            data-sliding-highlight=""
            data-moving={highlight.moving}
            className={cn(
              'pointer-events-none absolute -z-10 rounded bg-muted',
              highlightClassName
            )}
            initial={false}
            animate={{
              ...highlight.rect,
              opacity: highlight.visible ? 1 : 0
            }}
            transition={{
              default:
                reducedMotion || !highlight.moving
                  ? { duration: 0 }
                  : {
                      type: 'spring',
                      stiffness: 500,
                      damping: 38,
                      mass: 0.8,
                      ...spring
                    },
              opacity: { duration: reducedMotion ? 0 : 0.16, ease: 'easeOut' }
            }}
          />,
          container
        )}
    </>
  )
}
