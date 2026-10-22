import { createContext, useContext } from 'react'

/** Explicit, read-only sample runtime; never selected as a native error fallback. */
export const WidgetPreviewContext = createContext(false)
export function useWidgetPreview() {
  return useContext(WidgetPreviewContext)
}
