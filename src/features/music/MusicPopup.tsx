import { CardFooter } from '@/components/ui/card'
import { ScrollingText } from '@/components/ui/scrolling-text'
import { WidgetItemOutput } from '@/components/widget-item'

import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import type { SystemEvent } from '@/services/system/bridge'
import type { MediaData, RepeatMode } from '@/services/system/media.generated'
import {
  Heart,
  Music2,
  Repeat,
  Repeat1,
  Shuffle,
  TriangleAlert,
  Volume2,
  VolumeX
} from 'lucide-react'
import {
  FaBackwardStep as SkipBack,
  FaForwardStep as SkipForward
} from 'react-icons/fa6'

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { memo } from 'react'
import type { MusicPopupControls } from './useMusicPopupControls'
const nextRepeatMode = (mode: RepeatMode): RepeatMode =>
  mode === 'none' ? 'list' : mode === 'list' ? 'track' : 'none'

type GetMediaComponentProps = {
  status: SystemEvent<MediaData>['status']
  media: MediaData | null
  controls: MusicPopupControls
}

const getMediaComponent = ({
  status,
  media,
  controls
}: GetMediaComponentProps) => {
  const map = {
    ready: media && <MusicPopupContentData media={media} controls={controls} />,
    loading: <LoadingMidia />,
    error: <MidiaUnavaliable />,
    unavailable: <NoMidia />
  } as const

  return map[status]
}

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
    <div className="w-90">
      {demo && (
        <p className="text-muted-foreground text-caption">
          Versão de demonstração
        </p>
      )}
      <div className="p-4">
        {getMediaComponent({ status: event.status, media, controls })}
      </div>
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
    </div>
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
          aria-disabled={pending}
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
        onValueChange={([value]) => setVolumeDraft(value)}
        onValueCommit={([value]) => commitVolume(value)}
      />
      <WidgetItemOutput
        aria-label="Volume atual do player"
        className="min-w-8 text-right"
      >
        {level}
      </WidgetItemOutput>
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
      <div className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <div className="relative row-span-2 aspect-square self-stretch">
          {artwork && artwork !== badArt ? (
            <img
              src={artwork}
              alt="Capa do álbum"
              onError={() => setBadArt(artwork)}
              className="absolute inset-0 size-full rounded object-cover"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center rounded bg-muted">
              <Music2 aria-hidden="true" />
            </div>
          )}
        </div>
        {/* Metadata */}
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
        {/* Media controls */}
        <div className="flex items-center justify-center gap-1">
          {shuffleReady && (
            <Button
              variant={shuffle === true ? 'secondary' : 'ghost'}
              size="icon"
              aria-label="Aleatório"
              title="Aleatório"
              aria-pressed={shuffle === true}
              aria-disabled={pending.shuffle}
              aria-busy={pending.shuffle}
              onClick={() =>
                void act({ action: 'shuffle', active: shuffle !== true })
              }
            >
              <Shuffle size={16} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Faixa anterior"
            disabled={!media.capabilities.previous}
            aria-disabled={pending.playback || undefined}
            onClick={() => void act({ action: 'previous' })}
          >
            <SkipBack size={16} />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
            disabled={!media.capabilities.playPause}
            aria-disabled={pending.playback || undefined}
            onClick={() => void act({ action: 'playPause' })}
          >
            <PlayIcon size={18} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próxima faixa"
            disabled={!media.capabilities.next}
            aria-disabled={pending.playback || undefined}
            onClick={() => void act({ action: 'next' })}
          >
            <SkipForward size={16} />
          </Button>
          {repeatReady && (
            <Button
              variant={
                repeat === 'track' || repeat === 'list' ? 'secondary' : 'ghost'
              }
              size="icon"
              aria-label="Repetição"
              title={
                repeat === 'track'
                  ? 'Repetir uma faixa'
                  : repeat === 'list'
                    ? 'Repetir tudo'
                    : 'Repetição desativada'
              }
              aria-pressed={repeat === 'track' || repeat === 'list'}
              aria-disabled={pending.repeat}
              aria-busy={pending.repeat}
              onClick={() =>
                void act({
                  action: 'repeat',
                  mode: nextRepeatMode(repeat ?? 'none')
                })
              }
            >
              {repeat === 'track' ? (
                <Repeat1 size={16} />
              ) : (
                <Repeat size={16} />
              )}
            </Button>
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
              disabled={favoriteDisabled && !pending.favorite}
              aria-disabled={favoriteDisabled}
              aria-busy={pending.favorite || favoritePending}
              onClick={() =>
                void act({ action: 'favorite', saved: !favoriteValue })
              }
              className="text-primary"
            >
              <Heart size={16} fill={favoriteValue ? 'currentColor' : 'none'} />
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Slider
          variant="secondary"
          aria-label="Progresso da música"
          min={progress?.minSeekMs ?? 0}
          max={progress?.maxSeekMs || 1}
          step={1}
          value={[
            progress
              ? Math.min(
                  progress.maxSeekMs,
                  Math.max(progress.minSeekMs, position)
                )
              : 0
          ]}
          disabled={
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

function NoMidia() {
  return (
    <Empty role="status">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Music2 />
        </EmptyMedia>
        <EmptyTitle>Nenhuma mídia tocando</EmptyTitle>
        <EmptyDescription>
          Reproduza alguma mídia para exibir os controles
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function LoadingMidia() {
  return (
    <p role="status" className="flex items-center gap-2">
      <Spinner />
      <span>Carregando mídia...</span>
    </p>
  )
}

function MidiaUnavaliable() {
  return (
    <p role="status" className="text-destructive flex items-center gap-2">
      <TriangleAlert />
      <span>Mídia indisponível</span>
    </p>
  )
}
