import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { overlay } from '../services/system/overlay'
import {
  popupMetadata,
  resolvePopup,
  type PopupId,
  type PopupParams
} from '../popups/resolve'
import { claimPopup, releasePopup } from '../popups/coordinator'

/** Every opening owns a new session, including repeated clicks on one widget. */
export function useOverlayPopover<K extends PopupId>(
  component: K,
  params?: PopupParams<K>,
  anchorRef?: RefObject<HTMLElement | null>
) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef<HTMLElement>(null)
  const active = useRef<string | null>(null)
  const close = useCallback(() => {
    const session = active.current
    active.current = null
    setOpen(false)
    if (session) {
      releasePopup(session)
      return overlay.hide(session)
    }
    return Promise.resolve()
  }, [])
  useEffect(() => {
    if (overlay.mode !== 'native') return
    let cancelled = false
    let stop: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const dispose = await listen<{
          session: string
          restoreFocus?: boolean
        }>('overlay:closed', (event) => {
          if (event.payload.session === active.current) {
            releasePopup(event.payload.session)
            active.current = null
            setOpen(false)
            if (event.payload.restoreFocus) ref.current?.focus()
          }
        })
        if (cancelled) dispose()
        else stop = dispose
      })
      .catch(console.error)
    const outside = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node))
        void close().catch(console.error)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void close().catch(console.error)
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('pointerdown', outside)
    return () => {
      cancelled = true
      stop?.()
      window.removeEventListener('pointerdown', outside)
      window.removeEventListener('keydown', escape)
      const session = active.current
      active.current = null
      if (session) {
        releasePopup(session)
        void overlay.hide(session).catch(console.error)
      }
    }
  }, [close])
  async function toggle() {
    if (overlay.mode !== 'native') return
    if (active.current) return close()
    const anchor =
      anchorRef?.current ??
      ref.current?.closest('[data-overlay-anchor]') ??
      ref.current
    const rect = anchor?.getBoundingClientRect()
    if (!rect) return
    const session = crypto.randomUUID()
    active.current = session
    try {
      setError('')
      const definition = resolvePopup(component, params)
      const metadata = popupMetadata(component)
      claimPopup(session, () => {
        void close().catch(console.error)
      })
      await overlay.show({
        v: 1,
        kind: 'popover',
        component,
        params: definition.input,
        session,
        text: metadata.label,
        anchor: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        size: { width: 1, height: 1 },
        side:
          rect.top + rect.height / 2 < window.innerHeight / 2 ? 'bottom' : 'top'
      })
      if (active.current === session) setOpen(true)
    } catch (error) {
      if (active.current === session) active.current = null
      releasePopup(session)
      setError(String(error))
    }
  }
  const triggerRef = useCallback((node: HTMLElement | null) => {
    ref.current = node
  }, [])
  return { triggerRef, open, toggle, error, close }
}
