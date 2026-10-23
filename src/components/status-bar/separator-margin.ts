import { createContext, useContext } from 'react'

/** One shared margin for every separator, including editor previews. */
export const SeparatorMarginContext = createContext(0)
export function useSeparatorMargin() {
  return useContext(SeparatorMarginContext)
}
