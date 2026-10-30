import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  type RefObject
} from 'react'
import { WidgetIdentityContext } from '@/popups/widget-identity'
import { bouncePopupAnchor } from '../popups/motion'
import { overlay } from '../services/system/overlay'
import {
  popupMetadata,
  resolvePopup,
  type PopupId,
  type PopupParams
} from '../popups/resolve'
import type { PopupClosed } from '../popups/lifetime'
import { usePopupLifetime } from '../popups/use-popup-lifetime'

/** Every opening owns a new session, including repeated clicks on one widget. */
export function useOverlayPopover<K extends PopupId>(
  component: K,
  params?: PopupParams<K>,
  anchorRef?: RefObject<HTMLElement | null>
) {
  const runtime = useWidgetRuntime()
  const widget = useContext(WidgetIdentityContext)
  const ref = useRef<HTMLElement>(null)
  const bounce = useRef<ReturnType<typeof bouncePopupAnchor>>(undefined)
  const enabled = runtime.interactive && overlay.mode === 'native'
  const { lifetime, open, error } = usePopupLifetime(
    {
      mode: 'native',
      prepare() {
        const anchor =
          anchorRef?.current ??
          ref.current?.closest('[data-overlay-anchor]') ??
          ref.current
        const rect = anchor?.getBoundingClientRect()
        if (!rect) return
        const definition = resolvePopup(component, params)
        const metadata = popupMetadata(component)
        return (session) =>
          overlay.show({
            v: 1,
            kind: 'popover',
            component,
            widget,
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
              rect.top + rect.height / 2 < window.innerHeight / 2
                ? 'bottom'
                : 'top'
          })
      },
      hide: (session) => overlay.hide(session),
      beforeOpen: () => bounce.current?.complete(),
      dock() {
        bounce.current?.stop()
        bounce.current = bouncePopupAnchor(anchorRef?.current ?? ref.current)
      },
      cleanup: () => bounce.current?.stop(),
      restoreFocus: () => ref.current?.focus()
    },
    enabled
  )
  const close = useCallback(() => lifetime.setOpen(false), [lifetime])
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let stop: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const { getCurrentWebviewWindow } =
          await import('@tauri-apps/api/webviewWindow')
        const dispose = await listen<PopupClosed>(
          'overlay:closed',
          (event) => {
            if (event.payload.reattach) {
              if (
                event.payload.widget !== widget ||
                event.payload.component !== component
              )
                return
              const anchor = anchorRef?.current ?? ref.current
              const rect = anchor?.getBoundingClientRect()
              void import('@tauri-apps/api/core')
                .then(({ invoke }) =>
                  invoke('overlay_return', {
                    session: event.payload.session,
                    revision: event.payload.revision,
                    anchor: rect
                      ? {
                          x: rect.x,
                          y: rect.y,
                          width: rect.width,
                          height: rect.height
                        }
                      : null
                  })
                )
                .catch(console.error)
            } else if (event.payload.attached) {
              if (
                event.payload.widget === widget &&
                event.payload.component === component
              )
                lifetime.attach(event.payload.session)
            } else lifetime.closed(event.payload)
          },
          { target: getCurrentWebviewWindow().label }
        )
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
    }
  }, [close, enabled, lifetime, widget, component, anchorRef])
  async function toggle() {
    if (enabled) return lifetime.toggle()
  }
  const triggerRef = useCallback((node: HTMLElement | null) => {
    ref.current = node
  }, [])
  return { triggerRef, open, toggle, error, close }
}
