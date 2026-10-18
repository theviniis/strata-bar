import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { useSystemChannel } from '@/hooks/useSystemChannel'
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

// Keep the controls fixed while only overflowing metadata travels at 24 px/s.
function MusicText({
  text,
  describedBy
}: {
  text: string
  describedBy: string
}) {
  const viewport = useRef<HTMLSpanElement>(null)
  const content = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const box = viewport.current
    const label = content.current
    if (!box || !label) return
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let animation: Animation | undefined
    const measure = () => {
      animation?.cancel()
      animation = undefined
      const distance = label.scrollWidth - box.clientWidth
      if (distance <= 0 || box.clientWidth === 0 || motion?.matches) return
      const travel = (distance / 24) * 1000
      const duration = 2 * travel + 2400
      const pause = 1200 / duration
      animation = label.animate?.(
        [
          { transform: 'translateX(0)', offset: 0 },
          { transform: 'translateX(0)', offset: pause },
          { transform: `translateX(-${distance}px)`, offset: 0.5 },
          { transform: `translateX(-${distance}px)`, offset: 0.5 + pause },
          { transform: 'translateX(0)', offset: 1 }
        ],
        { duration, iterations: Infinity, easing: 'linear' }
      )
    }
    const observer =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(measure)
    observer?.observe(box)
    observer?.observe(label)
    motion?.addEventListener?.('change', measure)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      animation?.cancel()
      observer?.disconnect()
      motion?.removeEventListener?.('change', measure)
      window.removeEventListener('resize', measure)
    }
  }, [text])
  return (
    <span
      ref={viewport}
      className="relative z-10 mx-1 min-w-0 flex-1 overflow-hidden text-[11px] motion-reduce:text-ellipsis"
      aria-describedby={describedBy}
    >
      <span ref={content} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  )
}

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
    <div
      aria-label={demo ? 'Música · demonstração' : 'Música'}
      className="min-w-0 max-w-45 shrink overflow-hidden"
    >
      <div
        className="relative isolate flex min-w-0 items-center overflow-hidden rounded bg-muted/40 text-inherit [text-shadow:0_1px_2px_rgb(0_0_0/0.9)] group-data-[theme=light]:bg-[#302a3e]/5 group-data-[theme=light]:text-shadow-none"
        {...tip.trigger}
      >
        {current?.artwork.status === 'ready' && current.artwork.value && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <img
              src={current.artwork.value}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = 'none'
              }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
        <MediaControls current={current} pending={pending} onClick={act} />
        <MusicText text={text} describedBy={tip.describedBy} />
        <WidgetItemTooltip id={tip.describedBy}>{tooltip}</WidgetItemTooltip>
      </div>
    </div>
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
    <div className="flex items-center">
      {mediaControlMap(current).map(([action, label, Icon]) => (
        <WidgetItem
          key={action}
          aria-label={label}
          disabled={!current || pending || !current.capabilities[action]}
          className="relative z-10 shrink-0 px-1 disabled:opacity-40"
          onClick={() => onClick({ action })}
        >
          <WidgetItemIcon
            icon={Icon}
            size={14}
            className="text-primary cursor-pointer"
          />
        </WidgetItem>
      ))}
    </div>
  )
}
