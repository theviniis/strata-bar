import { Slot } from '@radix-ui/react-slot'
import {
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type PointerEvent
} from 'react'
import { createPortal } from 'react-dom'

interface HoverRect {
  left: number
  top: number
  width: number
  height: number
}

/** One sliding hover background per bar; widgets opt in with data-widget-hover.
 * Inspired by Jhey's progressive anchor pagination:
 * https://codepen.io/jh3y/pen/qEbVOMm
 * DOM geometry keeps this working on WebView2 without CSS anchor support.
 */
export function WidgetHoverGroup({ children }: { children: ReactElement }) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [highlight, setHighlight] = useState<{
    rect: HoverRect | null
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
    // Metrics and responsive layout can change the hovered widget's size.
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
        className="isolate"
        onPointerMove={(event: PointerEvent<HTMLElement>) => {
          if (event.pointerType === 'touch') return
          const target = (event.target as Element).closest<HTMLElement>(
            '[data-widget-hover]'
          )
          if (
            !target ||
            !event.currentTarget.contains(target) ||
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
          <span
            aria-hidden="true"
            data-widget-hover-highlight=""
            data-moving={highlight.moving}
            className="pointer-events-none absolute -z-10 rounded bg-muted transition-opacity duration-200 ease-out data-[moving=true]:transition-[left,top,width,height,opacity] motion-reduce:transition-none"
            style={{
              ...highlight.rect,
              opacity: highlight.visible ? 1 : 0
            }}
          />,
          container
        )}
    </>
  )
}
