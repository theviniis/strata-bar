import { createContext } from 'react'

/** Stable configured widget identity, scoped to its native bar by the host. */
export const WidgetIdentityContext = createContext<string | undefined>(
  undefined
)
