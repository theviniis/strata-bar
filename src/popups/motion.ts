import { animate } from 'motion'
import type { OverlaySide, OverlaySize } from '../services/system/overlay'
import { POPUP_GAP } from './constants'

// Reference recording (60 fps): app contraction/travel ~350 ms, island settling ~400 ms.
export const POPUP_EXIT_MS = 350

// Opening reference: capsule emerges at ~0.60 s and settles at ~1.10 s.
export const POPUP_ENTER_MS = 500
// One continuous deceleration: segmented easings introduce velocity jumps.
export const POPUP_ENTER_EASE = [0.22, 1, 0.36, 1] as const

export function popupOpenKeyframes(
  side: OverlaySide,
  size: OverlaySize,
  anchor?: OverlaySize
) {
  const direction = side === 'bottom' ? 1 : -1
  const width = Math.min(0.7, (anchor?.width ?? 64) / Math.max(1, size.width))
  const height = Math.min(
    0.15,
    (anchor?.height ?? 24) / Math.max(1, size.height)
  )
  return {
    scaleX: [width, 1],
    scaleY: [height, 1],
    y: [-direction * POPUP_GAP, 0],
    opacity: [0, 1],
    clipPath: [160, 0].map((radius) => `inset(0px round ${radius}px)`)
  }
}

export function popupMotionEnabled() {
  return (
    typeof window !== 'undefined' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

export function popupDockKeyframes(
  side: OverlaySide,
  size: OverlaySize,
  anchor?: OverlaySize
) {
  const direction = side === 'bottom' ? -1 : 1
  const width = Math.min(0.7, (anchor?.width ?? 64) / Math.max(1, size.width))
  const height = Math.min(
    0.25,
    (anchor?.height ?? 24) / Math.max(1, size.height)
  )
  // The leading edge first retreats, then the miniature panel slides into the
  // bar boundary. Scaling about arrowX keeps edge-clamped panels on target.
  return {
    scaleX: [null, Math.max(width, 0.42), width, width * 0.86],
    scaleY: [null, 0.42, height, 0.001],
    y: [
      null,
      -direction * POPUP_GAP,
      direction * POPUP_GAP * 0.4,
      direction * POPUP_GAP
    ],
    opacity: [null, 1, 1, 0],
    filter: [null, 'blur(0px)', 'blur(1px)', 'blur(1px)']
  }
}

/** Animate the whole widget, never a wrapper that changes bar geometry. */
export function bouncePopupAnchor(node: HTMLElement | null) {
  if (!node || !popupMotionEnabled()) return
  return animate(
    node,
    {
      scaleX: [1, 0.94, 1.06, 0.985, 1],
      scaleY: [1, 1.2, 0.94, 1.025, 1]
    },
    { duration: 0.4, times: [0, 0.22, 0.5, 0.75, 1], ease: 'easeInOut' }
  )
}
