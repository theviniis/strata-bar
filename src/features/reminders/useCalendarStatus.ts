import { calendar } from '@/services/system/calendar'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/** Every native window reloads the secure service state after account changes. */
export function useCalendarStatus(native: boolean) {
  const [listenerError, setListenerError] = useState<Error | null>(null)
  const query = useQuery({
    queryKey: ['calendar', 'status', native],
    queryFn: calendar.status,
    enabled: native,
    networkMode: 'always',
    retry: false,
    refetchOnWindowFocus: true
  })
  const { refetch } = query
  useEffect(() => {
    if (!native) return
    let cancelled = false
    let dispose: (() => void) | undefined
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen('calendar:changed', () => {
          void refetch()
        })
      )
      .then((unlisten) => {
        if (cancelled) unlisten()
        else {
          dispose = unlisten
          void refetch()
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setListenerError(new Error(String(error)))
      })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [native, refetch])
  return { ...query, error: query.error ?? listenerError }
}
