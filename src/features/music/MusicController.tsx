import {
  defaultView,
  type WidgetView
} from '@/components/status-bar/presentation'
import { ScrollingText } from '@/components/ui/scrolling-text'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { WidgetPopup } from '@/popups/WidgetPopup'
import {
  bridge,
  connect,
  createMockBridge,
  type DemoChannelData,
  type SystemEvent
} from '@/services/system/bridge'
import type {
  MediaAction,
  MediaData,
  MediaRequest
} from '@/services/system/media.generated'
import { useEffect, useRef, useState } from 'react'
import { useWidgetView } from '@/components/status-bar/widget-view'

import { Music } from './Music'
import { musicFixture } from './fixtures'
export function MusicController() {
  const view = useWidgetView()
  const event = useSystemChannel('media', 0, view.intervalMs)
  return (
    <MusicContent
      event={event}
      tooltip={view.tooltip}
      onAction={async (request) => {
        if (!bridge.mediaAction)
          throw new Error('Controles de mídia indisponíveis')
        await bridge.mediaAction(request)
      }}
    />
  )
}

export function DemoMusicController({
  staticPreview = false,
  view = defaultView
}: {
  staticPreview?: boolean
  view?: WidgetView
}) {
  const [adapter] = useState(createMockBridge)
  const [event, setEvent] = useState<SystemEvent<MediaData>>({
    status: 'loading'
  })
  useEffect(() => {
    if (staticPreview) return
    return connect<DemoChannelData, 'media'>(
      adapter,
      'media',
      {},
      setEvent,
      (error) => setEvent({ status: 'error', error: String(error) })
    )
  }, [adapter, staticPreview])
  return (
    <MusicContent
      demo
      tooltip={view.tooltip}
      event={staticPreview ? { status: 'ready', data: musicFixture() } : event}
      onAction={(request) =>
        staticPreview ? Promise.resolve() : adapter.mediaAction!(request)
      }
    />
  )
}

export function MusicContent({
  event,
  onAction,
  demo = false,
  tooltip = true
}: {
  event: SystemEvent<MediaData>
  onAction(request: MediaRequest): Promise<unknown>
  demo?: boolean
  /** The widget's configured tooltip toggle. */
  tooltip?: boolean
}) {
  const current = event.status === 'ready' ? event.data : null
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{
    identity: string
    message: string
  } | null>(null)
  const [badArt, setBadArt] = useState<string | null>(null)
  const busy = useRef(false)
  const identity = `${current?.sessionId}/${current?.trackId}`
  const error = failure?.identity === identity ? failure.message : ''
  const latestIdentity = useRef(identity)
  useEffect(() => {
    latestIdentity.current = identity
  }, [identity])
  const text = current
    ? `${current.title || 'Sem título'}${current.artist ? ` — ${current.artist}` : ''}`
    : event.status === 'loading'
      ? 'Carregando mídia…'
      : event.status === 'error'
        ? 'Mídia indisponível'
        : 'Nenhuma música tocando'
  const artwork =
    current?.artwork.status === 'ready' ? current.artwork.value : null
  const tooltipText = `${demo ? 'Demonstração · ' : ''}${text}${error ? ` · ${error}` : ''}`
  const tip = useOverlayTooltip(tooltip ? tooltipText : '')
  async function act(action: MediaAction) {
    if (!current || busy.current) return
    busy.current = true
    setPending(true)
    setFailure(null)
    const sentIdentity = identity
    try {
      await onAction({
        sessionId: current.sessionId,
        trackId: current.trackId,
        action
      })
    } catch (e) {
      if (latestIdentity.current === sentIdentity)
        setFailure({ identity: sentIdentity, message: String(e) })
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return (
    <WidgetPopup.Root popup="music">
      <WidgetPopup.Anchor asChild>
        <Music
          current={current}
          pending={pending}
          demo={demo}
          artwork={artwork === badArt ? null : artwork}
          onArtworkError={() => setBadArt(artwork)}
          onAction={act}
          tooltipTrigger={tip.trigger}
        >
          <WidgetPopup.Trigger asChild>
            <button
              aria-label="Abrir player de música"
              className="relative z-10 flex min-w-0 flex-1 cursor-pointer items-center self-stretch focus-visible:outline-primary data-[popup-open=true]:bg-transparent"
            >
              <ScrollingText
                text={text}
                aria-describedby={tooltip ? tip.describedBy : undefined}
                className="relative z-10 mx-1 flex-1 text-bar"
              />
            </button>
          </WidgetPopup.Trigger>
        </Music>
      </WidgetPopup.Anchor>
      {tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>
          {tooltipText}
        </WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
