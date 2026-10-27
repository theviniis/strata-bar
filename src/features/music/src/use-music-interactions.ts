import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'
import { MusicInteractions } from './interactions'

/** Binds an owner to an identity without restarting on transport callback renders. */
export function useMusicInteractions(
  media: MediaData | null,
  onAction: (request: MediaRequest) => Promise<unknown>,
  active = true
) {
  const runtime = useWidgetRuntime()
  const sessionId = media?.sessionId
  const trackId = media?.trackId
  const interactions = useMemo(
    () =>
      new MusicInteractions(
        !active ||
          !runtime.interactive ||
          sessionId === undefined ||
          trackId === undefined
          ? null
          : { sessionId, trackId }
      ),
    [sessionId, trackId, active, runtime]
  )
  useLayoutEffect(() => {
    interactions.setTransport(onAction)
  }, [interactions, onAction])
  useLayoutEffect(() => {
    if (active) return runtime.effect(() => interactions.open())
  }, [interactions, active, runtime])
  const state = useSyncExternalStore(
    interactions.subscribe,
    interactions.getSnapshot
  )
  return { state, interactions }
}
