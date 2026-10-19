import { lazy } from 'react'

/**
 * The document renders exactly one view: the native host selects it with
 * `?view=` and the browser studio falls back to the demo shell. Only the native
 * bar is imported eagerly, so a bar window never pays for the studio shell, the
 * popup-check fixture or the shared popup surface — those are loaded on demand.
 */
export const OverlayView = lazy(() => import('./overlay/Overlay'))
export const StudioView = lazy(() => import('./app/App'))
export const PopupCheckView = lazy(() =>
  import('./popups/PopupCheckBar').then((module) => ({
    default: module.PopupCheckBar
  }))
)
