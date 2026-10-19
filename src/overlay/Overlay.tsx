import { useEffect, useState } from 'react'
import { QueryProvider } from '@/components/QueryProvider'
import type { OverlayRender, OverlaySnapshot } from '../services/system/overlay'
import { PopupHost } from '../popups/PopupHost'
import { overlay } from '../services/system/overlay'
import { TooltipSurface } from './TooltipSurface'
import { overlayTextClasses } from './typography'

/**
 * The overlay window's whole document. It renders one surface at a time and
 * nothing while idle: no timers, no subscriptions, no layout work. Rust owns
 * the window, its size and its position; popup content owns its subscriptions.
 */
export default function Overlay() {
  const [render, setRender] = useState<OverlayRender | null>(null)
  const [closing, setClosing] = useState<string | null>(null)
  useEffect(() => {
    // The overlay is only meaningful inside the native host.
    if (!window.__TAURI_INTERNALS__) return
    let latest = 0
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const accept = (payload: OverlayRender) => {
          if (cancelled) return
          const session = payload.session ?? 0
          if (session < latest) return
          latest = session
          setClosing(null)
          setRender(payload)
        }
        const stopRender = await listen<OverlayRender>(
          'overlay:render',
          (event) => accept(event.payload)
        )
        const stopClosing = await listen<string>('overlay:closing', (event) => {
          if (!cancelled) setClosing(event.payload)
        })
        const stopClear = await listen<number>('overlay:clear', (event) => {
          const session = event.payload ?? latest
          if (session < latest) return
          latest = session
          setRender(null)
        })
        if (cancelled) {
          stopRender()
          stopClosing()
          stopClear()
        } else {
          dispose = () => {
            stopRender()
            stopClosing()
            stopClear()
          }
          const { invoke } = await import('@tauri-apps/api/core')
          const prepared = await invoke<OverlaySnapshot | null>('overlay_ready')
          if (prepared && !cancelled && prepared.session >= latest) {
            if (prepared.render) accept(prepared.render)
            else {
              latest = prepared.session
              setRender(null)
            }
          }
        }
      })
      .catch((error) => console.error('Overlay listener', error))
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [])
  if (!render) return null
  return (
    // Same typography/colour context as the native bar, so future popovers and
    // tooltip content inherit the bar's text instead of the bare document.
    <QueryProvider>
      <div
        aria-hidden={render.kind === 'tooltip' ? true : undefined}
        className={overlayTextClasses}
      >
        {render.kind === 'tooltip' ? (
          <TooltipSurface
            text={render.text}
            side={render.side}
            arrowX={render.arrowX}
          />
        ) : render.kind === 'popover' ? (
          <PopupHost
            id={render.component}
            params={render.params}
            mode="native"
            closing={closing !== null && closing === render.popup_session}
            close={() => {
              void overlay.hide(render.popup_session).catch(console.error)
            }}
            key={render.session}
            session={render.popup_session}
            side={render.side}
            arrowX={render.arrowX}
          />
        ) : null}
      </div>
    </QueryProvider>
  )
}
