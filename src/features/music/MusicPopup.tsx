import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { ScrollingText } from '@/components/ui/scrolling-text'
import { SpotifySettings } from './SpotifySettings'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
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
  MediaRequest,
  RepeatMode
} from '@/services/system/media.generated'
import {
  Heart,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX
} from 'lucide-react'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { MediaClock } from './progress'

export function MusicPopup() {
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const media = event.status === 'ready' ? event.data : null
  return (
    <MusicPopupCard
      key={media ? `${media.sessionId}/${media.trackId}` : 'empty'}
      event={event}
      media={media}
      onAction={onAction}
      demo={demo}
      settingsOpen={settingsOpen}
      setSettingsOpen={setSettingsOpen}
    />
  )
}

function MusicPopupCard({
  event,
  media,
  onAction,
  demo,
  settingsOpen,
  setSettingsOpen
}: {
  event: SystemEvent<MediaData>
  media: MediaData | null
  onAction(request: MediaRequest): Promise<unknown>
  demo: boolean
  settingsOpen: boolean
  setSettingsOpen(open: boolean): void
}) {
  const controls = useMusicPopupControls(media, onAction)
  const { volumeReady, muteReady, level, muted, pending, act, setVolumeDraft } =
    controls
  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <Card className="w-90">
        <div className="w-full" hidden={settingsOpen}>
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
              <MusicPopupContentData media={media} controls={controls} />
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
        {!settingsOpen && volumeReady && (
          <MusicVolumeFooter
            muteReady={muteReady}
            level={level}
            muted={muted}
            pending={pending.volume}
            act={act}
            setVolumeDraft={setVolumeDraft}
          />
        )}
      </Card>
    </Dialog>
  )
}

// The progress clock ticks every 100 ms; volume only depends on these props.
const MusicVolumeFooter = memo(function MusicVolumeFooter({
  muteReady,
  level,
  muted,
  pending,
  act,
  setVolumeDraft
}: Pick<
  ReturnType<typeof useMusicPopupControls>,
  'muteReady' | 'level' | 'muted' | 'act' | 'setVolumeDraft'
> & { pending: boolean }) {
  return (
    <CardFooter className="flex items-center gap-2">
      {muteReady && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={muted ? 'Ativar som do player' : 'Silenciar player'}
          aria-pressed={muted}
          title="Volume do player"
          disabled={pending}
          aria-busy={pending}
          onClick={() => void act({ action: 'mute', muted: !muted })}
        >
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </Button>
      )}
      <Slider
        aria-label="Volume do player"
        min={0}
        max={100}
        step={1}
        value={[level]}
        disabled={pending}
        onValueChange={([value]) => setVolumeDraft(value)}
        onValueCommit={([value]) => {
          setVolumeDraft(value)
          void act({ action: 'volume', level: value }).finally(() =>
            setVolumeDraft(null)
          )
        }}
      />
    </CardFooter>
  )
})

function time(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

type ActionGroup = 'playback' | 'favorite' | 'volume' | 'shuffle' | 'repeat'

/** Independent busy groups so one pending control never locks the rest. */
function actionGroup(action: MediaAction): ActionGroup {
  switch (action.action) {
    case 'favorite':
      return 'favorite'
    case 'volume':
    case 'mute':
      return 'volume'
    case 'shuffle':
      return 'shuffle'
    case 'repeat':
      return 'repeat'
    default:
      return 'playback'
  }
}

const nextRepeatMode = (mode: RepeatMode): RepeatMode =>
  mode === 'none' ? 'list' : mode === 'list' ? 'track' : 'none'

function useMusicPopupControls(
  media: MediaData | null,
  onAction: (request: MediaRequest) => Promise<unknown>
) {
  const [pending, setPending] = useState<Record<ActionGroup, boolean>>({
    playback: false,
    favorite: false,
    volume: false,
    shuffle: false,
    repeat: false
  })
  const busy = useRef<Record<ActionGroup, boolean>>({
    playback: false,
    favorite: false,
    volume: false,
    shuffle: false,
    repeat: false
  })
  const [error, setError] = useState('')
  const [positionMs, setPositionMs] = useState(0)
  const [clock] = useState(() => new MediaClock())
  const [seek, setSeek] = useState<number | null>(null)
  const [badArt, setBadArt] = useState<string | null>(null)
  const [volumeDraft, setVolumeDraft] = useState<number | null>(null)
  const progress =
    media?.progress.status === 'ready' ? media.progress.value : null
  const artwork = media?.artwork.status === 'ready' ? media.artwork.value : null
  const favoriteValue =
    media?.favorite.status === 'ready' ? media.favorite.value : null
  const volume = media?.volume.status === 'ready' ? media.volume.value : null
  const level = volumeDraft ?? volume?.level ?? 0
  const muted = volume?.muted ?? false
  const shuffle = media?.shuffle.status === 'ready' ? media.shuffle.value : null
  const repeat = media?.repeat.status === 'ready' ? media.repeat.value : null
  // A control only renders when the running player actually supports it; an
  // incompatible player hides it instead of showing a permanently dead button.
  const volumeReady = volume !== null && media?.capabilities.volume === true
  const muteReady = volumeReady && media?.capabilities.mute === true
  // Favorites belong to the player, not to a single track: a connected Spotify
  // session renders the control at once, and a track that is still being
  // correlated shows a pending state instead of vanishing.
  const favoriteSupported = media?.capabilities.favorite ?? false
  const favoritePending =
    favoriteSupported && media?.favorite.status === 'unavailable'
  const favoriteDisabled =
    pending.favorite || favoritePending || media?.favorite.status === 'error'
  const favoriteTitle =
    media?.favorite.status === 'ready'
      ? 'Faixa salva na biblioteca do Spotify'
      : (media?.favorite.reason ?? 'Consultando o Spotify…')
  const shuffleReady = shuffle !== null && media?.capabilities.shuffle === true
  const repeatReady = repeat !== null && media?.capabilities.repeat === true
  const playing = media?.playback === 'playing'
  useEffect(() => {
    clock.update(progress, playing)
    const publish = () => setPositionMs(clock.read())
    publish()
  }, [clock, progress, playing])
  useEffect(() => {
    const timer = setInterval(() => setPositionMs(clock.read()), 100)
    return () => clearInterval(timer)
  }, [clock])
  const sessionId = media?.sessionId
  const trackId = media?.trackId
  const act = useCallback(
    async (action: MediaAction) => {
      if (sessionId === undefined || trackId === undefined) return false
      const group = actionGroup(action)
      if (busy.current[group]) return false
      busy.current[group] = true
      setPending((value) => ({ ...value, [group]: true }))
      setError('')
      try {
        await onAction({
          sessionId,
          trackId,
          action
        })
        if (action.action === 'seek') {
          clock.seek(action.positionMs)
          setPositionMs(clock.read())
        }
        return true
      } catch (e) {
        setError(String(e))
        return false
      } finally {
        busy.current[group] = false
        setPending((value) => ({ ...value, [group]: false }))
        if (action.action === 'seek') setSeek(null)
      }
    },
    [sessionId, trackId, onAction, clock]
  )
  const position = seek ?? (progress ? positionMs : 0)
  const PlayIcon = playing ? Pause : Play
  const busyAny = Object.values(pending).some(Boolean)
  return {
    pending,
    error,
    setSeek,
    badArt,
    setBadArt,
    progress,
    artwork,
    favoriteValue,
    shuffle,
    repeat,
    favoriteSupported,
    favoritePending,
    favoriteDisabled,
    favoriteTitle,
    shuffleReady,
    repeatReady,
    playing,
    act,
    position,
    PlayIcon,
    busyAny,
    volumeReady,
    muteReady,
    level,
    muted,
    setVolumeDraft
  }
}

function MusicPopupContentData({
  media,
  controls
}: {
  media: MediaData
  controls: ReturnType<typeof useMusicPopupControls>
}) {
  const {
    pending,
    error,
    setSeek,
    badArt,
    setBadArt,
    progress,
    artwork,
    favoriteValue,
    shuffle,
    repeat,
    favoriteSupported,
    favoritePending,
    favoriteDisabled,
    favoriteTitle,
    shuffleReady,
    repeatReady,
    playing,
    act,
    position,
    PlayIcon,
    busyAny
  } = controls
  return (
    <div className="flex flex-col gap-4" aria-busy={busyAny}>
      <div className="relative grid grid-cols-[80px_minmax(0,1fr)] items-center gap-3">
        <button
          type="button"
          aria-label={`Abrir ${media.playerName || 'player de música'}`}
          disabled={pending.playback || !media.capabilities.openPlayer}
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
      <div className="flex items-center justify-center gap-1">
        {shuffleReady && (
          <Toggle
            aria-label="Aleatório"
            title="Aleatório"
            pressed={shuffle === true}
            disabled={pending.shuffle}
            aria-busy={pending.shuffle}
            onPressedChange={(active) =>
              void act({ action: 'shuffle', active })
            }
          >
            <Shuffle size={18} />
          </Toggle>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Faixa anterior"
          disabled={pending.playback || !media.capabilities.previous}
          onClick={() => void act({ action: 'previous' })}
        >
          <SkipBack size={18} />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
          disabled={pending.playback || !media.capabilities.playPause}
          onClick={() => void act({ action: 'playPause' })}
        >
          <PlayIcon size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próxima faixa"
          disabled={pending.playback || !media.capabilities.next}
          onClick={() => void act({ action: 'next' })}
        >
          <SkipForward size={18} />
        </Button>
        {repeatReady && (
          <Toggle
            aria-label="Repetição"
            title={
              repeat === 'track'
                ? 'Repetir uma faixa'
                : repeat === 'list'
                  ? 'Repetir tudo'
                  : 'Repetição desativada'
            }
            pressed={repeat === 'track' || repeat === 'list'}
            disabled={pending.repeat}
            aria-busy={pending.repeat}
            onPressedChange={() =>
              void act({
                action: 'repeat',
                mode: nextRepeatMode(repeat ?? 'none')
              })
            }
          >
            {repeat === 'track' ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </Toggle>
        )}
        {favoriteSupported && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              favoriteValue
                ? 'Remover dos favoritos'
                : 'Adicionar aos favoritos'
            }
            aria-pressed={Boolean(favoriteValue)}
            title={favoriteTitle}
            disabled={favoriteDisabled}
            aria-busy={pending.favorite || favoritePending}
            onClick={() =>
              void act({ action: 'favorite', saved: !favoriteValue })
            }
            className="text-primary"
          >
            <Heart size={18} fill={favoriteValue ? 'currentColor' : 'none'} />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Slider
          variant="secondary"
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
            pending.playback ||
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
