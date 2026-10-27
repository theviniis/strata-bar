import { createContext, useContext } from 'react'
import { liveWidgetRuntime } from '@/services/system/widget-runtime'

/** Explicit, read-only sample runtime; never selected as a native error fallback. */
export const WidgetRuntimeContext = createContext(liveWidgetRuntime)
export function useWidgetRuntime() {
  return useContext(WidgetRuntimeContext)
}
