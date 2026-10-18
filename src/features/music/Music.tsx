import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
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
  const available = Boolean(current)
  const [retained, setRetained] = useState(current)
  const [open, setOpen] = useState(false)
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
  if (current && current !== retained) setRetained(current)
  useEffect(() => {
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    ).matches
    const frame = requestAnimationFrame(() => setOpen(available))
    const timer = available
      ? undefined
      : setTimeout(() => setRetained(null), reduced ? 0 : 180)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [available])
  const text = retained
    ? `${retained.title || 'Sem título'}${retained.artist ? ` — ${retained.artist}` : ''}`
    : ''
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
      aria-hidden={!current}
      inert={!current}
      className="min-w-0 shrink overflow-hidden transition-[max-width,opacity,margin-right] duration-180 motion-reduce:transition-none"
      style={{
        width: 240,
        maxWidth: open ? 240 : 0,
        opacity: open ? 1 : 0,
        marginRight: open && !demo ? 8 : 0
      }}
    >
      {retained && (
        <div
          className="relative isolate flex min-w-0 items-center overflow-hidden rounded bg-muted/40 text-inherit group-data-[theme=light]:bg-[#302a3e]/5"
          {...tip.trigger}
        >
          {retained.artwork.status === 'ready' && retained.artwork.value && (
            <>
              <img
                src={retained.artwork.value}
                alt=""
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
                className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover"
              />
              <span className="pointer-events-none absolute inset-0 -z-10 bg-background/85 group-data-[theme=light]:bg-[#f8f5f2]/85" />
            </>
          )}
          {(
            [
              ['previous', 'Faixa anterior', SkipBack],
              [
                'playPause',
                retained.playback === 'playing' ? 'Pausar' : 'Reproduzir',
                retained.playback === 'playing' ? Pause : Play
              ],
              ['next', 'Próxima faixa', SkipForward]
            ] as const
          ).map(([action, label, Icon]) => (
            <WidgetItem
              key={action}
              aria-label={label}
              disabled={!current || pending || !retained.capabilities[action]}
              className="shrink-0 px-1 disabled:opacity-40"
              onClick={() => void act({ action })}
            >
              <WidgetItemIcon icon={Icon} size={12} />
            </WidgetItem>
          ))}
          <span
            className="min-w-0 truncate px-1 text-[11px]"
            aria-describedby={tip.describedBy}
          >
            {text}
          </span>
          <WidgetItemTooltip id={tip.describedBy}>{tooltip}</WidgetItemTooltip>
        </div>
      )}
    </div>
  )
}
