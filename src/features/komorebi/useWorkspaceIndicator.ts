import { useLayoutEffect, useRef } from 'react'

const INDICATOR_WIDTH = 24
const ANIMATION_DURATION = 450

export function useWorkspaceIndicator(
  activeIndex: number | undefined,
  offline: boolean
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLSpanElement>(null)
  const itemsRef = useRef(new Map<number, HTMLButtonElement>())

  const previousIndexRef = useRef<number | null>(null)
  const animationRef = useRef<Animation | null>(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const indicator = indicatorRef.current

    if (!container || !indicator || activeIndex === undefined) {
      return
    }

    const target = itemsRef.current.get(activeIndex)

    if (!target) return

    const getPosition = (element: HTMLElement) =>
      element.offsetLeft + element.offsetWidth / 2 - INDICATOR_WIDTH / 2

    const targetX = getPosition(target)
    const previousIndex = previousIndexRef.current

    // Initial render: position without animation
    if (previousIndex === null) {
      indicator.style.left = `${targetX}px`
      indicator.style.width = `${INDICATOR_WIDTH}px`
      previousIndexRef.current = activeIndex
      return
    }

    if (previousIndex === activeIndex) return

    // Capture current visual position before interrupting
    // an existing animation.
    const indicatorRect = indicator.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()

    const fromLeft = indicatorRect.left - containerRect.left
    const fromRight = fromLeft + indicatorRect.width

    const toLeft = targetX
    const toRight = targetX + INDICATOR_WIDTH

    animationRef.current?.cancel()

    const movingRight = toLeft > fromLeft

    // Stretch towards the destination.
    const stretchedLeft = movingRight ? fromLeft : toLeft

    const stretchedRight = movingRight ? toRight : fromRight

    const stretchedWidth = stretchedRight - stretchedLeft

    const animation = indicator.animate(
      [
        {
          left: `${fromLeft}px`,
          width: `${fromRight - fromLeft}px`,
          offset: 0,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)'
        },
        {
          left: `${stretchedLeft}px`,
          width: `${stretchedWidth}px`,
          offset: 0.5,
          easing: 'cubic-bezier(0.34, 1.2, 0.64, 1)'
        },
        {
          left: `${toLeft}px`,
          width: `${INDICATOR_WIDTH}px`,
          offset: 1
        }
      ],
      {
        duration: ANIMATION_DURATION,
        fill: 'forwards'
      }
    )

    animationRef.current = animation
    previousIndexRef.current = activeIndex

    animation.onfinish = () => {
      indicator.style.left = `${targetX}px`
      indicator.style.width = `${INDICATOR_WIDTH}px`

      animation.cancel()

      if (animationRef.current === animation) {
        animationRef.current = null
      }
    }
  }, [activeIndex, offline])

  useLayoutEffect(() => {
    if (offline || activeIndex === undefined) {
      animationRef.current?.cancel()
      animationRef.current = null
      previousIndexRef.current = null
    }
  }, [offline, activeIndex])

  useLayoutEffect(() => () => animationRef.current?.cancel(), [])

  return {
    containerRef,
    indicatorRef,
    itemRef: (index: number, element: HTMLButtonElement | null) => {
      if (element) itemsRef.current.set(index, element)
      else itemsRef.current.delete(index)
    }
  }
}
