import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog'
import { SpotifySettings } from './SpotifySettings'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { ScrollingText } from '@/components/ui/scrolling-text'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useSystemChannel } from '@/hooks/useSystemChannel'
import { usePopupContext } from '@/popups/context'
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
import {
  Heart,
  Music2,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MediaClock } from './progress'

export function MusicPopup() {
  const { mode } = usePopupContext('music')
  return mode === 'native' ? <NativeMusicPopup /> : <DemoMusicPopup />
}

function NativeMusicPopup() {
  const event = useSystemChannel('media')
  return (
    <MusicPopupContent
      event={event}
      onAction={async (request) => {
        if (!bridge.mediaAction) throw new Error('Contrôles indisponíveis')
        await bridge.mediaAction(request)
      }}
    />
  )
}

function DemoMusicPopup() {
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
    <MusicPopupContent
      event={event}
      demo
      onAction={(request) => adapter.mediaAction!(request)}
    />
  )
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
  // Full typed media contract: metadata, artwork, progress, volume and capabilities.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const media = event.status === 'ready' ? event.data : null
  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <Card className="min-w-80">
        <div hidden={settingsOpen}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Player de música</CardTitle>
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Configurações do Spotify"
                >
                  <Settings size={16} />
                </Button>
              </DialogTrigger>
            </div>
            <CardDescription>
              {demo
                ? 'Demonstração · Controle a sua mídia'
                : 'Controle a sua mídia'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {media ? (
              <MusicPopupContentData
                key={`${media.sessionId}/${media.trackId}`}
                media={media}
                onAction={onAction}
              />
            ) : (
              <p role="status">
                {event.status === 'loading'
                  ? 'Carregando mídia…'
                  : event.status === 'error'
                    ? 'Mídia indisponível'
                    : 'Nenhuma música tocando'}
              </p>
            )}
          </CardContent>
        </div>
        <DialogContent
          inline
          className="w-80 max-w-full"
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>Configurações do Spotify</DialogTitle>
            <DialogDescription>
              Conecte sua conta para gerenciar suas músicas favoritas.
            </DialogDescription>
          </DialogHeader>
          <SpotifySettings />
        </DialogContent>
      </Card>
    </Dialog>
  )
}

function time(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function MusicPopupContentData({
  media,
  onAction
}: {
  media: MediaData
  onAction(request: MediaRequest): Promise<unknown>
}) {
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const [favoritePending, setFavoritePending] = useState(false)
  const favoriteBusy = useRef(false)
  const [error, setError] = useState('')
  const [positionMs, setPositionMs] = useState(0)
  const [clock] = useState(() => new MediaClock())
  const [seek, setSeek] = useState<number | null>(null)
  const [badArt, setBadArt] = useState<string | null>(null)
  const progress =
    media.progress.status === 'ready' ? media.progress.value : null
  const artwork = media.artwork.status === 'ready' ? media.artwork.value : null
  const favoriteKnown =
    media.favorite.status === 'ready' && media.favorite.value !== null
  const playing = media.playback === 'playing'
  useEffect(() => {
    clock.update(progress, playing)
    const publish = () => setPositionMs(clock.read())
    publish()
  }, [clock, progress, playing])
  useEffect(() => {
    const timer = setInterval(() => setPositionMs(clock.read()), 100)
    return () => clearInterval(timer)
  }, [clock])
  async function act(action: MediaAction) {
    const isFavorite = action.action === 'favorite'
    const actionBusy = isFavorite ? favoriteBusy : busy
    const setActionPending = isFavorite ? setFavoritePending : setPending
    if (actionBusy.current) return
    actionBusy.current = true
    setActionPending(true)
    setError('')
    try {
      await onAction({
        sessionId: media.sessionId,
        trackId: media.trackId,
        action
      })
      if (action.action === 'seek') {
        clock.seek(action.positionMs)
        setPositionMs(clock.read())
      }
    } catch (e) {
      setError(String(e))
    } finally {
      actionBusy.current = false
      setActionPending(false)
      if (action.action === 'seek') setSeek(null)
    }
  }
  const position = seek ?? (progress ? positionMs : 0)
  const PlayIcon = playing ? Pause : Play
  return (
    <div className="flex flex-col gap-4" aria-busy={pending}>
      <div className="relative grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
        <button
          type="button"
          aria-label={`Abrir ${media.playerName || 'player de música'}`}
          disabled={pending || !media.capabilities.openPlayer}
          onClick={() => void act({ action: 'openPlayer' })}
          className="absolute inset-0 z-10 cursor-pointer rounded focus-visible:outline-accent disabled:cursor-default"
        />
        {artwork && artwork !== badArt ? (
          <img
            src={artwork}
            alt="Capa do álbum"
            onError={() => setBadArt(artwork)}
            className="aspect-square w-20 rounded object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded bg-muted">
            <Music2 aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0 text-[12px] text-muted-foreground">
          <h1 className="min-w-0 mb-1 text-foreground" title={media.title}>
            <ScrollingText
              className="text-[14px]"
              text={media.title || 'Sem título'}
            />
          </h1>
          <p className="truncate" title={media.artist}>
            {media.artist || 'Artista desconhecido'}
          </p>
          <p className="truncate" title={media.album}>
            {media.album || 'Álbum desconhecido'}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Faixa anterior"
          disabled={pending || !media.capabilities.previous}
          onClick={() => void act({ action: 'previous' })}
        >
          <SkipBack size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
          disabled={pending || !media.capabilities.playPause}
          onClick={() => void act({ action: 'playPause' })}
        >
          <PlayIcon size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próxima faixa"
          disabled={pending || !media.capabilities.next}
          onClick={() => void act({ action: 'next' })}
        >
          <SkipForward size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            favoriteKnown
              ? media.favorite.value
                ? 'Remover dos favoritos'
                : 'Adicionar aos favoritos'
              : 'Favorito indisponível'
          }
          aria-pressed={
            favoriteKnown ? Boolean(media.favorite.value) : undefined
          }
          title={
            media.favorite.reason ?? 'Faixa salva na biblioteca do Spotify'
          }
          disabled={
            favoritePending || !favoriteKnown || !media.capabilities.favorite
          }
          aria-busy={favoritePending}
          onClick={() =>
            void act({ action: 'favorite', saved: !media.favorite.value })
          }
        >
          <Heart
            size={18}
            fill={
              favoriteKnown && media.favorite.value ? 'currentColor' : 'none'
            }
          />
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        <Slider
          aria-label="Progresso da música"
          min={progress?.minSeekMs ?? 0}
          max={progress?.maxSeekMs || 1}
          step={1000}
          value={[
            progress
              ? Math.min(
                  progress.maxSeekMs,
                  Math.max(progress.minSeekMs, position)
                )
              : 0
          ]}
          disabled={
            pending ||
            !progress ||
            !media.capabilities.seek ||
            progress.maxSeekMs <= progress.minSeekMs
          }
          onValueChange={([value]) => setSeek(value)}
          onValueCommit={([value]) => {
            if (progress && media.capabilities.seek)
              void act({ action: 'seek', positionMs: value })
          }}
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{progress ? time(position) : '—'}</span>
          <span>{progress ? time(progress.durationMs) : '—'}</span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
