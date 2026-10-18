import { useEffect, useState } from 'react'
import type { OverlayRender } from '../services/system/overlay'
import { TooltipSurface } from './TooltipSurface'

/**
 * The overlay window's whole document. It renders one surface at a time and
 * nothing while idle: no timers, no subscriptions, no layout work. Rust owns
 * the window, its size and its position; this component only paints the pill.
 */
export default function Overlay() {
  const [render, setRender] = useState<OverlayRender | null>(null)
  useEffect(() => {
    // The overlay is only meaningful inside the native host.
    if (!window.__TAURI_INTERNALS__) return
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const stopRender = await listen<OverlayRender>(
          'overlay:render',
          (event) => setRender(event.payload)
        )
        const stopClear = await listen('overlay:clear', () => setRender(null))
        if (cancelled) {
          stopRender()
          stopClear()
        } else {
          dispose = () => {
            stopRender()
            stopClear()
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
    <div
      aria-hidden="true"
      className="font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none"
    >
      {render.kind === 'tooltip' ? (
        <TooltipSurface text={render.text} side={render.side} />
      ) : null}
    </div>
  )
}
