import { useEffect, useLayoutEffect, useState } from 'react'
import { FaPause as Pause, FaPlay as Play } from 'react-icons/fa6'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'
import { MediaClock } from './progress'
import { useMusicInteractions } from './use-music-interactions'
export function useMusicPopupControls(
  media: MediaData | null,
  onAction: (request: MediaRequest) => Promise<unknown>,
  active = true
) {
  const { state, interactions } = useMusicInteractions(media, onAction, active)
  const { pending, error, volumeDraft } = state
  const [positionMs, setPositionMs] = useState(0)
  const [clock] = useState(() => new MediaClock())
  const [badArt, setBadArt] = useState<string | null>(null)
  const progress =
    media?.progress.status === 'ready' ? media.progress.value : null
  const artwork = media?.artwork.status === 'ready' ? media.artwork.value : null
  const favoriteValue =
    media?.favorite.status === 'ready' ? media.favorite.value : null
  const volume = media?.volume.status === 'ready' ? media.volume.value : null
  const level = volumeDraft ?? volume?.level ?? 0
  const muted = state.muteDraft ?? volume?.muted ?? false
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
  useLayoutEffect(() => {
    if (!state.confirmedSeek) return
    clock.seek(state.confirmedSeek.positionMs)
    const publish = () => setPositionMs(clock.read())
    publish()
  }, [clock, state.confirmedSeek])
  useLayoutEffect(() => {
    interactions.observeVolume(volume?.level ?? null, volume?.muted ?? null)
  }, [interactions, volume?.level, volume?.muted])
  const act = interactions.dispatch
  const setVolumeDraft = interactions.setVolume
  const commitVolume = setVolumeDraft
  const setSeek = interactions.setSeek
  const position = state.seekDraft ?? (progress ? positionMs : 0)
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
    setVolumeDraft,
    commitVolume
  }
}

export type MusicPopupControls = ReturnType<typeof useMusicPopupControls>
