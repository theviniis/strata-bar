import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { ScrollingText } from '@/components/ui/scrolling-text'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Toggle } from '@/components/ui/toggle'
import type { SystemEvent } from '@/services/system/bridge'
import type { MediaData, RepeatMode } from '@/services/system/media.generated'
import {
  Heart,
  Music2,
  Repeat,
  Repeat1,
  Shuffle,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  FaBackwardStep as SkipBack,
  FaForwardStep as SkipForward
} from 'react-icons/fa6'

import { memo } from 'react'
import type { MusicPopupControls } from './useMusicPopupControls'
const nextRepeatMode = (mode: RepeatMode): RepeatMode =>
  mode === 'none' ? 'list' : mode === 'list' ? 'track' : 'none'

export function MusicPopup({
  event,
  media,
  controls,
  demo
}: {
  event: SystemEvent<MediaData>
  media: MediaData | null
  controls: MusicPopupControls
  demo: boolean
}) {
  const {
    volumeReady,
    muteReady,
    level,
    muted,
    pending,
    act,
    setVolumeDraft,
    commitVolume
  } = controls
  return (
    <Card className="w-90">
      <CardHeader>
        <CardTitle>Player de música</CardTitle>
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
        {((!media && event.status === 'unavailable') ||
          media?.favorite.status === 'unauthenticated') && (
          <p className="mt-4 text-caption text-muted-foreground">
            Para conectar o Spotify, abra Configurações → Player de música.
          </p>
        )}
      </CardContent>
      {volumeReady && (
        <MusicVolumeFooter
          muteReady={muteReady}
          level={level}
          muted={muted}
          pending={pending.volume}
          act={act}
          setVolumeDraft={setVolumeDraft}
          commitVolume={commitVolume}
        />
      )}
    </Card>
  )
}

// The progress clock ticks every 100 ms; volume only depends on these props.
const MusicVolumeFooter = memo(function MusicVolumeFooter({
  muteReady,
  level,
  muted,
  pending,
  act,
  setVolumeDraft,
  commitVolume
}: Pick<
  MusicPopupControls,
  'muteReady' | 'level' | 'muted' | 'act' | 'setVolumeDraft' | 'commitVolume'
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
        onValueCommit={([value]) => commitVolume(value)}
      />
    </CardFooter>
  )
})

function time(ms: number) {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function MusicPopupContentData({
  media,
  controls
}: {
  media: MediaData
  controls: MusicPopupControls
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
        <div className="min-w-0 text-body text-muted-foreground">
          <h1 className="min-w-0 mb-1 text-foreground" title={media.title}>
            <ScrollingText
              className="text-title"
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
        <div className="flex justify-between text-caption text-muted-foreground tabular-nums">
          <span>{progress ? time(position) : '—'}</span>
          <span>{progress ? time(progress.durationMs) : '—'}</span>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-body text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
