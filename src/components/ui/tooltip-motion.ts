import { useReducedMotion } from 'motion/react'
import { POPUP_ENTER_EASE } from '../../popups/motion'

/** A compact capsule reveal using the same deceleration as widget popups. */
export function useTooltipMotion() {
  const reducedMotion = useReducedMotion()
  return {
    initial: reducedMotion
      ? (false as const)
      : { opacity: 0, scaleX: 0.7, scaleY: 0.15 },
    animate: { opacity: 1, scaleX: 1, scaleY: 1 },
    transition: {
      duration: reducedMotion ? 0 : 0.28,
      ease: POPUP_ENTER_EASE,
      opacity: { duration: reducedMotion ? 0 : 0.1, ease: 'easeOut' as const }
    }
  }
}
