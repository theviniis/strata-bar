import { useCallback, useEffect, useRef, useState } from 'react'
import { FaPause as Pause, FaPlay as Play } from 'react-icons/fa6'

import type {
  MediaAction,
  MediaData,
  MediaRequest
} from '@/services/system/media.generated'
import { MediaClock } from './progress'
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

export function useMusicPopupControls(
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
  const [volumeDraft, updateVolumeDraft] = useState<number | null>(null)
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
  const queuedSeek = useRef<MediaAction | null>(null)
  const act = useCallback(
    async function dispatch(action: MediaAction): Promise<boolean> {
      if (sessionId === undefined || trackId === undefined) return false
      const group = actionGroup(action)
      if (busy.current[group]) {
        if (action.action === 'seek') queuedSeek.current = action
        return false
      }
      busy.current[group] = true
      setPending((value) => ({ ...value, [group]: true }))
      setError('')
      try {
        let next: MediaAction | null = action
        while (next) {
          const current = next
          await onAction({ sessionId, trackId, action: current })
          if (current.action === 'seek') {
            clock.seek(current.positionMs)
            setPositionMs(clock.read())
          }
          next = group === 'playback' ? queuedSeek.current : null
          if (group === 'playback') queuedSeek.current = null
        }
        return true
      } catch (e) {
        if (group === 'playback') queuedSeek.current = null
        setError(String(e))
        return false
      } finally {
        busy.current[group] = false
        setPending((value) => ({ ...value, [group]: false }))
        if (group === 'playback') setSeek(null)
      }
    },
    [sessionId, trackId, onAction, clock]
  )
  // Keep the latest intent visible until the native session acknowledges it.
  // Only one write is in flight; pointer moves replace the queued value.
  const volumeQueue = useRef<number | null>(null)
  const volumeWriting = useRef(false)
  const lastVolume = useRef<number | null>(null)
  const setVolumeDraft = useCallback(
    (value: number) => {
      if (sessionId === undefined || trackId === undefined) return
      updateVolumeDraft(value)
      if (lastVolume.current === value) return
      lastVolume.current = value
      volumeQueue.current = value
      if (volumeWriting.current) return
      volumeWriting.current = true
      void (async () => {
        try {
          while (volumeQueue.current !== null) {
            const level = volumeQueue.current
            volumeQueue.current = null
            await onAction({
              sessionId,
              trackId,
              action: { action: 'volume', level }
            })
          }
        } catch (e) {
          volumeQueue.current = null
          lastVolume.current = null
          updateVolumeDraft(null)
          setError(String(e))
        } finally {
          volumeWriting.current = false
        }
      })()
    },
    [onAction, sessionId, trackId]
  )
  const commitVolume = setVolumeDraft
  useEffect(() => {
    if (volumeDraft === null) return
    const timer = setTimeout(
      () => {
        if (!volumeWriting.current) {
          updateVolumeDraft(null)
          lastVolume.current = null
        }
      },
      volume?.level === volumeDraft ? 0 : 3000
    )
    return () => clearTimeout(timer)
  }, [volumeDraft, volume?.level])
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
    setVolumeDraft,
    commitVolume
  }
}

export type MusicPopupControls = ReturnType<typeof useMusicPopupControls>
