import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Config } from '@/services/configuration/config'

/** WebView2 exposes the Windows app colour preference through this media query. */
export function useResolvedTheme(theme: Config['bar']['theme']) {
  const media = useMemo(
    () =>
      theme === 'system'
        ? window.matchMedia?.('(prefers-color-scheme: dark)')
        : undefined,
    [theme]
  )
  const subscribe = useCallback(
    (listener: () => void) => {
      media?.addEventListener('change', listener)
      return () => media?.removeEventListener('change', listener)
    },
    [media]
  )
  const dark = useSyncExternalStore(
    subscribe,
    () => media?.matches ?? false,
    () => false
  )
  return theme === 'system' ? (dark ? 'dark' : 'light') : theme
}
