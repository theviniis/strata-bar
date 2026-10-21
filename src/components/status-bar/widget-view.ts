import { createContext, useContext } from 'react'
import { defaultView, type WidgetView } from './presentation'

/**
 * The configured presentation of the widget currently rendering. `Widget`
 * provides it from that widget's configuration entry, so a feature widget
 * reads its format, tooltip toggle and interval without threading props through
 * every call site (the studio preview keeps the defaults).
 */
export const WidgetViewContext = createContext<WidgetView>(defaultView)

export function useWidgetView() {
  return useContext(WidgetViewContext)
}
