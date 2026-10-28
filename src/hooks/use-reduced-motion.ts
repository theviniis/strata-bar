import { useConfig } from '@/stores/config'

/** Animation preference belongs to Strata, independently of browser settings. */
export function useReducedMotion() {
  return useConfig((state) => state.config.bar.reduceMotion)
}
