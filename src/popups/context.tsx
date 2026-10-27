import { createContext, useContext } from 'react'
import type { PopupId, PopupValues } from './resolve'

export interface PopupContextValue {
  id: PopupId
  mode: 'native' | 'demo'
  side?: 'top' | 'bottom'
  closing?: boolean
  params: unknown
  close(): void
}

export const PopupContext = createContext<PopupContextValue | null>(null)

export function usePopupContext<K extends PopupId>(
  id: K
): Omit<PopupContextValue, 'params'> & { params: PopupValues<K> } {
  const context = useContext(PopupContext)
  if (!context || context.id !== id) {
    throw new Error(`Popup '${id}' must render inside its PopupHost`)
  }
  return { ...context, params: context.params as PopupValues<K> }
}
