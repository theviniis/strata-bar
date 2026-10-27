import { useLayoutEffect, useMemo, useSyncExternalStore } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'
import { MusicInteractions } from './interactions'

/** Binds an owner to an identity without restarting on transport callback renders. */
export function useMusicInteractions(
  media: MediaData | null,
  onAction: (request: MediaRequest) => Promise<unknown>,
  active = true
) {
  const preview = useWidgetPreview()
  const sessionId = media?.sessionId
  const trackId = media?.trackId
  const interactions = useMemo(
    () =>
      new MusicInteractions(
        !active || preview || sessionId === undefined || trackId === undefined
          ? null
          : { sessionId, trackId }
      ),
    [sessionId, trackId, active, preview]
  )
  useLayoutEffect(() => {
    interactions.setTransport(onAction)
  }, [interactions, onAction])
  useLayoutEffect(() => {
    if (active && !preview) return interactions.open()
  }, [interactions, active, preview])
  const state = useSyncExternalStore(
    interactions.subscribe,
    interactions.getSnapshot
  )
  return { state, interactions }
}
