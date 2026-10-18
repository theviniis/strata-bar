import { tooltipPillClasses } from '@/components/ui/tooltip-classes'
import type { OverlaySize } from '../services/system/overlay'

/**
 * CSS px reserved on the anchored side of the surface for the tooltip arrow.
 * The window's anchored edge sits flush with the bar and this padding is the
 * gap the arrow spans, so Rust never needs to know about the arrow.
 */
export const TOOLTIP_ARROW_ALLOWANCE = 6

/**
 * Measures the real pill with the real classes before the overlay is shown, so
 * a show is one `SetWindowPos` with no resize round trip. The probe is detached
 * from layout: fixed, off-screen, invisible and pointer-transparent.
 */
export function measureTooltip(text: string): OverlaySize {
  if (typeof document === 'undefined') {
    return { width: 1, height: 1 + TOOLTIP_ARROW_ALLOWANCE }
  }
  const surface = document.createElement('div')
  surface.setAttribute('aria-hidden', 'true')
  surface.className = 'inline-block'
  surface.style.cssText = `position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;padding-top:${TOOLTIP_ARROW_ALLOWANCE}px`
  const pill = document.createElement('div')
  pill.className = tooltipPillClasses
  pill.textContent = text
  surface.appendChild(pill)
  document.body.appendChild(surface)
  const rect = surface.getBoundingClientRect()
  surface.remove()
  // One transparent pixel of slack: sub-pixel text metrics must never clip.
  return {
    width: Math.ceil(rect.width) + 2,
    height: Math.ceil(rect.height) + 1
  }
}
