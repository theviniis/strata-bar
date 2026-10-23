import { useCallback, useEffect, useState } from 'react'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'
import {
  bridge,
  connect,
  createMockBridge,
  type DemoChannelData,
  type SystemEvent
} from '@/services/system/bridge'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'
import { MusicPopup } from './MusicPopup'
import { useMusicPopupControls } from './useMusicPopupControls'
export function MusicPopupController() {
  const { mode } = usePopupContext('music')
  return mode === 'native' ? <NativeMusicPopup /> : <DemoMusicPopup />
}

function NativeMusicPopup() {
  const event = useSystemChannel('media')
  const onAction = useCallback(async (request: MediaRequest) => {
    if (!bridge.mediaAction) throw new Error('Contrôles indisponíveis')
    await bridge.mediaAction(request)
  }, [])
  return <MusicPopupContent event={event} onAction={onAction} />
}

function DemoMusicPopup() {
  const [adapter] = useState(createMockBridge)
  const onAction = useCallback(
    (request: MediaRequest) => adapter.mediaAction!(request),
    [adapter]
  )
  const [event, setEvent] = useState<SystemEvent<MediaData>>({
    status: 'loading'
  })
  useEffect(
    () =>
      connect<DemoChannelData, 'media'>(
        adapter,
        'media',
        {},
        setEvent,
        (error) => setEvent({ status: 'error', error: String(error) })
      ),
    [adapter]
  )
  return <MusicPopupContent event={event} demo onAction={onAction} />
}

export function MusicPopupContent({
  event,
  onAction,
  demo = false
}: {
  event: SystemEvent<MediaData>
  onAction(request: MediaRequest): Promise<unknown>
  demo?: boolean
}) {
  const media = event.status === 'ready' ? event.data : null
  return (
    <MusicPopupState
      key={media ? `${media.sessionId}/${media.trackId}` : 'empty'}
      event={event}
      media={media}
      onAction={onAction}
      demo={demo}
    />
  )
}

function MusicPopupState({
  event,
  media,
  onAction,
  demo
}: {
  event: SystemEvent<MediaData>
  media: MediaData | null
  onAction(request: MediaRequest): Promise<unknown>
  demo: boolean
}) {
  const controls = useMusicPopupControls(media, onAction)
  return (
    <MusicPopup event={event} media={media} demo={demo} controls={controls} />
  )
}
