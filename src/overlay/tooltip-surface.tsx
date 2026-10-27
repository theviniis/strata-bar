import {
  tooltipArrowClasses,
  tooltipPillClasses
} from '@/components/ui/tooltip-classes'
import { cn } from '@/lib/utils'
import { motion } from 'motion/react'
import { useTooltipMotion } from '@/components/ui/tooltip-motion'
import type { OverlaySide } from '../services/system/overlay'
import { TOOLTIP_ARROW_ALLOWANCE } from './measure'

interface TooltipSurfaceProps {
  text: string
  side: OverlaySide
  arrowX?: number
}

/**
 * The tooltip pill rendered inside the overlay window. `side` describes where
 * the surface sits relative to the bar, so a `bottom` surface points its arrow
 * up at the bar above it.
 */
export function TooltipSurface({ text, side, arrowX }: TooltipSurfaceProps) {
  const pointsUp = side === 'bottom'
  const animation = useTooltipMotion()
  return (
    <div
      className="inline-block w-full"
      style={
        pointsUp
          ? { paddingTop: TOOLTIP_ARROW_ALLOWANCE }
          : { paddingBottom: TOOLTIP_ARROW_ALLOWANCE }
      }
    >
      <motion.div
        {...animation}
        className="relative flex justify-center"
        style={{
          transformOrigin: `${arrowX === undefined ? '50%' : `${arrowX}px`} ${pointsUp ? '0%' : '100%'}`
        }}
      >
        <div className={tooltipPillClasses}>{text}</div>
        <span
          aria-hidden="true"
          style={{ left: arrowX ?? '50%' }}
          className={cn(
            tooltipArrowClasses,
            'absolute -translate-x-1/2',
            pointsUp ? '-top-1' : '-bottom-1'
          )}
        />
      </motion.div>
    </div>
  )
}
