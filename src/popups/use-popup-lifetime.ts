import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore
} from 'react'
import { PopupLifetime, type PopupLifetimeAdapter } from './lifetime'

/** Bind ownership to a mounted widget without restarting on callback renders. */
export function usePopupLifetime(
  adapter: PopupLifetimeAdapter,
  enabled = true
) {
  const [lifetime] = useState(() => new PopupLifetime(adapter))
  useLayoutEffect(() => {
    lifetime.setAdapter(adapter)
  }, [lifetime, adapter])
  useEffect(() => {
    if (enabled) return lifetime.dispose
  }, [lifetime, enabled])
  const state = useSyncExternalStore(lifetime.subscribe, lifetime.getSnapshot)
  return { lifetime, ...state }
}
