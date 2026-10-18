/** Keep the native dismissal grace period longer than this animation. */
export const POPUP_EXIT_MS = 220

export function popupMotionEnabled() {
  return (
    typeof HTMLElement.prototype.animate === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}
