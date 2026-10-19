import { ScrollingText } from '@/components/ui/scrolling-text'
import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
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
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export function Music() {
  const event = useSystemChannel('media')
  return (
    <MusicContent
      event={event}
      onAction={async (request) => {
        if (!bridge.mediaAction)
          throw new Error('Controles de mídia indisponíveis')
        await bridge.mediaAction(request)
      }}
    />
  )
}

export function DemoMusic() {
  const [adapter] = useState(createMockBridge)
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
  return (
    <MusicContent
      demo
      event={event}
      onAction={(request) => adapter.mediaAction!(request)}
    />
  )
}

export function MusicContent({
  event,
  onAction,
  demo = false
}: {
  event: SystemEvent<MediaData>
  onAction(request: MediaRequest): Promise<unknown>
  demo?: boolean
}) {
  const current = event.status === 'ready' ? event.data : null
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{
    identity: string
    message: string
  } | null>(null)
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
  const tooltip = `${demo ? 'Demonstração · ' : ''}${text}${error ? ` · ${error}` : ''}`
  const tip = useOverlayTooltip(tooltip)
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
        <WidgetItem className="group/music p-0" disabled={!current} asChild>
          <div
            aria-label={demo ? 'Música · demonstração' : 'Música'}
            className="min-w-0 max-w-45 shrink overflow-hidden"
          >
            <div
              className="relative isolate flex min-w-0 items-center overflow-hidden rounded bg-muted/40 mask-[linear-gradient(#000,#000)] text-foreground group-data-[theme=light]:bg-[#302a3e]/5"
              {...tip.trigger}
            >
              {artwork && (
                <div className="pointer-events-none absolute inset-0 z-0">
                  <img
                    src={artwork}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 bg-black/70 group-data-[theme=light]:bg-[#f8f5f2]/50" />
                  {/* The cover sits above the bar's shared hover highlight, so
                      the music widget mirrors that surface (and the popup-open
                      state) with its own layer. */}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded bg-muted opacity-0 transition-opacity duration-200 ease-out group-hover/music:opacity-100 group-data-[popup-open=true]/music:opacity-100 motion-reduce:transition-none"
                  />
                </div>
              )}
              <MediaControls
                current={current}
                pending={pending}
                onClick={act}
              />
              <WidgetPopup.Trigger asChild>
                <button
                  aria-label="Abrir player de música"
                  className="relative z-10 flex min-w-0 flex-1 cursor-pointer items-center self-stretch focus-visible:outline-accent"
                >
                  <ScrollingText
                    text={text}
                    aria-describedby={tip.describedBy}
                    className="relative z-10 mx-1 flex-1 text-[11px]"
                  />
                </button>
              </WidgetPopup.Trigger>
              <WidgetItemTooltip id={tip.describedBy}>
                {tooltip}
              </WidgetItemTooltip>
            </div>
          </div>
        </WidgetItem>
      </WidgetPopup.Anchor>
    </WidgetPopup.Root>
  )
}

const mediaControlMap = (current: MediaData | null) =>
  [
    ['previous', 'Faixa anterior', SkipBack],
    [
      'playPause',
      current?.playback === 'playing' ? 'Pausar' : 'Reproduzir',
      current?.playback === 'playing' ? Pause : Play
    ],
    ['next', 'Próxima faixa', SkipForward]
  ] as const

type NediaControlMapReturn = ReturnType<typeof mediaControlMap>[number][0]

interface MediaControlsProps {
  current: MediaData | null
  pending: boolean
  onClick: (data: { action: NediaControlMapReturn }) => void
}

function MediaControls({ current, pending, onClick }: MediaControlsProps) {
  return (
    <div className="flex items-center" aria-busy={pending}>
      {mediaControlMap(current).map(([action, label, Icon]) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          // Not a WidgetItem: controls must not become their own hover targets.
          disabled={!current || !current.capabilities[action]}
          aria-disabled={pending || undefined}
          className="relative z-10 shrink-0 cursor-pointer rounded p-1 disabled:cursor-default disabled:opacity-40"
          onClick={() => {
            if (!pending) onClick({ action })
          }}
        >
          <WidgetItemIcon icon={Icon} size={12} className="text-secondary" />
        </button>
      ))}
    </div>
  )
}
