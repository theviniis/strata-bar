import {
  tooltipArrowClasses,
  tooltipPillClasses
} from '@/components/ui/tooltip-classes'
import { cn } from '@/lib/utils'
import type { OverlaySide } from '../services/system/overlay'
import { TOOLTIP_ARROW_ALLOWANCE } from './measure'

interface TooltipSurfaceProps {
  text: string
  side: OverlaySide
}

/**
 * The tooltip pill rendered inside the overlay window. `side` describes where
 * the surface sits relative to the bar, so a `bottom` surface points its arrow
 * up at the bar above it.
 */
export function TooltipSurface({ text, side }: TooltipSurfaceProps) {
  const pointsUp = side === 'bottom'
  return (
    <div
      className="inline-block"
      style={
        pointsUp
          ? { paddingTop: TOOLTIP_ARROW_ALLOWANCE }
          : { paddingBottom: TOOLTIP_ARROW_ALLOWANCE }
      }
    >
      <div className="relative">
        <div className={tooltipPillClasses}>{text}</div>
        <span
          aria-hidden="true"
          className={cn(
            tooltipArrowClasses,
            'absolute left-1/2 -translate-x-1/2',
            pointsUp ? '-top-1' : '-bottom-1'
          )}
        />
      </div>
    </div>
  )
}
