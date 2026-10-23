import { demoMedia } from '@/services/system/media'
import type { MusicPopupControls } from './useMusicPopupControls'
import { Pause } from 'lucide-react'

export const MUSIC_FIXTURE_TIME = 1792744860000
export function musicFixture() {
  const data = demoMedia()
  if (data.progress.value) data.progress.value.measuredAt = MUSIC_FIXTURE_TIME
  return data
}
export function musicControlsFixture(): MusicPopupControls {
  const media = musicFixture()
  return {
    pending: {
      playback: false,
      favorite: false,
      volume: false,
      shuffle: false,
      repeat: false
    },
    error: '',
    setSeek: () => {},
    badArt: null,
    setBadArt: () => {},
    progress: media.progress.status === 'ready' ? media.progress.value : null,
    artwork: null,
    favoriteValue: false,
    shuffle: false,
    repeat: 'none',
    favoriteSupported: true,
    favoritePending: false,
    favoriteDisabled: false,
    favoriteTitle: 'Spotify',
    shuffleReady: true,
    repeatReady: true,
    playing: true,
    act: async () => true,
    position: 30000,
    PlayIcon: Pause,
    busyAny: false,
    volumeReady: true,
    muteReady: true,
    level: 50,
    muted: false,
    setVolumeDraft: () => {},
    commitVolume: () => {}
  }
}
