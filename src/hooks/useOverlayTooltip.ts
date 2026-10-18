import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { measureTooltip } from '../overlay/measure'
import { overlay, type OverlayRequest } from '../services/system/overlay'
import { popupIsActive } from '../popups/coordinator'

/** Hover intent in ms: the bar strip is thin and the targets are small. */
export const TOOLTIP_DELAY = 250

type Pending = { owner: symbol; timer: ReturnType<typeof setTimeout> }

// One tooltip exists at a time, so ownership lives at module scope: a second
// widget taking over cancels the first before anything is placed.
let pending: Pending | null = null
let visible: { owner: symbol; session: string } | null = null
let policies = false

function warn(error: unknown) {
  console.error('Não foi possível exibir o tooltip', error)
}

function hide(owner?: symbol) {
  if (pending && (owner === undefined || pending.owner === owner)) {
    clearTimeout(pending.timer)
    pending = null
  }
  if (visible === null || (owner !== undefined && visible.owner !== owner))
    return
  const session = visible.session
  visible = null
  void overlay.hide(session).catch(warn)
}

function present(owner: symbol, target: Element, text: string) {
  if (popupIsActive()) return
  const rect = target.getBoundingClientRect()
  const session = crypto.randomUUID()
  const request: OverlayRequest = {
    session,
    v: 1,
    kind: 'tooltip',
    text,
    anchor: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    },
    size: measureTooltip(text),
    // Widgets sit on the monitor edge: the pill goes to the free side.
    side: rect.top + rect.height / 2 < window.innerHeight / 2 ? 'bottom' : 'top'
  }
  visible = { owner, session }
  void overlay.show(request).catch((error) => {
    if (visible?.owner === owner) visible = null
    warn(error)
  })
}

function installPolicies() {
  if (policies) return
  policies = true
  // A tooltip never survives losing the window, a click, or a fullscreen app.
  window.addEventListener('blur', () => hide())
  window.addEventListener('strata:popup-open', () => hide())
  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape') hide()
    },
    true
  )
  window.addEventListener('pointerdown', () => hide(), true)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hide()
  })
}

function schedule(owner: symbol, target: Element, text: string) {
  installPolicies()
  if (popupIsActive()) return
  if (visible?.owner === owner && !pending) return
  hide()
  pending = {
    owner,
    timer: setTimeout(() => {
      pending = null
      present(owner, target, text)
    }, TOOLTIP_DELAY)
  }
}

/**
 * Wires a widget to the native overlay tooltip: 150 ms hover/focus intent,
 * cancelable on leave, blur, Escape, pointer down or window blur. The browser
 * studio's adapter is a no-op, so the hook is safe to call anywhere.
 *
 * The returned `trigger` props carry the pointer/focus handlers and the ref;
 * `describedBy` is the id of the hidden `role="tooltip"` span the widget must
 * render (screen readers cannot follow text into another window).
 */
export function useOverlayTooltip(text: string) {
  const raw = useId()
  const ref = useRef<HTMLElement | null>(null)
  const [owner] = useState(() => Symbol('overlay-tooltip'))
  useEffect(() => () => hide(owner), [owner])
  const setTarget = useCallback((node: HTMLElement | null) => {
    ref.current = node
  }, [])
  const enter = () => {
    const target = ref.current
    if (target) schedule(owner, target, text)
  }
  return {
    describedBy: `overlay-tip-${raw.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    trigger: {
      ref: setTarget,
      onPointerEnter: enter,
      onFocus: enter,
      onPointerLeave: () => hide(owner),
      onBlur: () => hide(owner)
    }
  }
}
