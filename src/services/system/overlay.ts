/**
 * Transport for the shared native overlay window (`src-tauri/src/desktop.rs`).
 *
 * The bar never positions anything: it reports a CSS-pixel anchor plus the
 * measured surface size and Rust converts them to physical pixels. The browser
 * studio has no overlay window, so its adapter is a labelled no-op.
 */

export type OverlayMode = 'demo' | 'native'

/** `popover` is reserved for interactive per-widget popups. */
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
  kind: OverlayKind
  text: string
  anchor: OverlayAnchor
  size: OverlaySize
  side: OverlaySide
}

/** Event payload the overlay surface renders. */
export interface OverlayRender {
  kind: OverlayKind
  text: string
  side: OverlaySide
}

export interface OverlayAdapter {
  readonly mode: OverlayMode
  show(request: OverlayRequest): Promise<void>
  hide(): Promise<void>
}

export function createNativeOverlay(): OverlayAdapter {
  return {
    mode: 'native',
    async show(request) {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('overlay_show', { request })
    },
    async hide() {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('overlay_hide')
    }
  }
}

export function createDemoOverlay(): OverlayAdapter {
  return {
    mode: 'demo',
    async show() {},
    async hide() {}
  }
}

export const overlay: OverlayAdapter =
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__
    ? createNativeOverlay()
    : createDemoOverlay()
