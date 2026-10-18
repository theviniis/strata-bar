/**
 * Transport for the shared native overlay window (`src-tauri/src/desktop.rs`).
 *
 * The bar never positions anything: it reports a CSS-pixel anchor plus the
 * measured surface size and Rust converts them to physical pixels. The browser
 * studio has no overlay window, so its adapter is a labelled no-op.
 */

import type { PopupId } from '../../popups/resolve'

export type OverlayMode = 'demo' | 'native'

/** Interactive widget popups share the tooltip window. */
export type OverlayKind = 'tooltip' | 'popover'

/** `bottom` puts the surface below the bar; `top` puts it above a bottom bar. */
export type OverlaySide = 'top' | 'bottom'

/** Anchor rectangle in CSS px, relative to the reporting window's viewport. */
export interface OverlayAnchor {
  x: number
  y: number
  width: number
  height: number
}

/** Surface size in CSS px, including the arrow allowance. */
export interface OverlaySize {
  width: number
  height: number
}

export interface OverlayRequest {
  /** Contract version, re-validated natively. */
  v: 1
  /** Optional; when present it must equal the invoking bar window's label. */
  source?: string
  session?: string
  component?: PopupId
  params?: unknown
  kind: OverlayKind
  text: string
  anchor: OverlayAnchor
  size: OverlaySize
  side: OverlaySide
}

/** Event payload the overlay surface renders. */
export interface OverlayRender {
  /** Anchor center relative to the placed window, in CSS px. */
  arrowX?: number
  popup_session?: string
  session?: number
  component?: PopupId
  params?: unknown
  kind: OverlayKind
  text: string
  side: OverlaySide
}

export interface OverlaySnapshot {
  session: number
  render: OverlayRender | null
}

export interface OverlayAdapter {
  readonly mode: OverlayMode
  show(request: OverlayRequest): Promise<void>
  hide(session?: string): Promise<void>
  resize(session: string, size: OverlaySize): Promise<{ arrowX: number }>
}

export function createNativeOverlay(): OverlayAdapter {
  return {
    mode: 'native',
    async show(request) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('overlay_show', { request })
    },
    async hide(session?: string) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('overlay_hide', { session })
    },
    async resize(session, size) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('overlay_resize', { session, size })
    }
  }
}

export function createDemoOverlay(): OverlayAdapter {
  return {
    mode: 'demo',
    async show() {},
    async hide() {},
    async resize() {
      return { arrowX: 0 }
    }
  }
}

export const overlay: OverlayAdapter =
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__
    ? createNativeOverlay()
    : createDemoOverlay()
