import { MotionConfig } from 'motion/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { useReducedMotion } from '@/hooks/use-reduced-motion'

export function AnimationPreference({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  useLayoutEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reducedMotion)
  }, [reducedMotion])
  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'never'}>
      {children}
    </MotionConfig>
  )
}
