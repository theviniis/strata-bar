import { useAnimate, useReducedMotion } from 'motion/react'
import type { FocusEventHandler } from 'react'

export function useFocusBorder<T extends HTMLElement>(
  onFocus?: FocusEventHandler<T>,
  onBlur?: FocusEventHandler<T>
) {
  const [, animate] = useAnimate()
  const reducedMotion = useReducedMotion()

  return {
    onFocus: ((event) => {
      void animate(
        event.currentTarget,
        { borderColor: 'var(--ring)' },
        { duration: reducedMotion ? 0 : 0.45 }
      )
      onFocus?.(event)
    }) satisfies FocusEventHandler<T>,
    onBlur: ((event) => {
      void animate(
        event.currentTarget,
        { borderColor: 'color-mix(in oklab, var(--border) 50%, transparent)' },
        { duration: reducedMotion ? 0 : 0.2 }
      )
      onBlur?.(event)
    }) satisfies FocusEventHandler<T>
  }
}
