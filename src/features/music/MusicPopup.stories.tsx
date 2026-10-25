import { FaPause as Pause, FaPlay as Play } from 'react-icons/fa6'

import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { MusicPopup } from './MusicPopup'
import { musicControlsFixture, musicFixture } from './fixtures'
import type { MusicPopupControls } from './useMusicPopupControls'

const data = musicFixture()
const controls = musicControlsFixture()
const meta = {
  tags: ['autodocs'],
  title: 'Popups/Music',
  component: MusicPopup,
  args: { event: { status: 'ready', data }, media: data, demo: false, controls }
} satisfies Meta<typeof MusicPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Loading: Story = {
  args: { event: { status: 'loading' }, media: null }
}
export const Unavailable: Story = {
  args: { event: { status: 'unavailable' }, media: null }
}
export const Error: Story = {
  args: { controls: { ...controls, error: 'Falha ao controlar o player' } }
}
export const Pending: Story = {
  args: {
    controls: {
      ...controls,
      busyAny: true,
      pending: { ...controls.pending, playback: true }
    }
  }
}
function InteractivePlayer() {
  const [position, setPosition] = useState(30000)
  const [level, setLevel] = useState(50)
  const [playing, setPlaying] = useState(false)
  const [shuffle, setShuffle] = useState(false)
  const [favoriteValue, setFavorite] = useState(false)
  const [repeat, setRepeat] = useState(controls.repeat)
  const [muted, setMuted] = useState(false)
  const controlled: MusicPopupControls = {
    ...controls,
    position,
    level,
    playing,
    PlayIcon: playing ? Pause : Play,
    shuffle,
    favoriteValue,
    repeat,
    muted,
    setSeek: (value) =>
      setPosition(
        typeof value === 'function' ? (value(position) ?? 0) : (value ?? 0)
      ),
    setVolumeDraft: setLevel,
    commitVolume: setLevel,
    act: async (action) => {
      if (action.action === 'seek') setPosition(action.positionMs)
      if (action.action === 'playPause') setPlaying((old) => !old)
      if (action.action === 'volume') setLevel(action.level)
      if (action.action === 'mute') setMuted(action.muted)
      if (action.action === 'shuffle') setShuffle(action.active)
      if (action.action === 'favorite') setFavorite(action.saved)
      if (action.action === 'repeat') setRepeat(action.mode)
      return true
    }
  }
  return (
    <MusicPopup
      event={{ status: 'ready', data }}
      media={data}
      demo
      controls={controlled}
    />
  )
}
export const Controlled: Story = { render: () => <InteractivePlayer /> }
