import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Music } from './Music'
import { musicFixture } from './fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Music',
  component: Music,
  args: {
    current: musicFixture(),
    pending: false,
    demo: false,
    artwork: null,
    onArtworkError: fn(),
    onAction: fn(),
    tooltipTrigger: {},
    children: (
      <button aria-label="Abrir player de música">Dragonaut — Sleep</button>
    )
  }
} satisfies Meta<typeof Music>
export default meta
type Story = StoryObj<typeof meta>
export const Playing: Story = {}
export const Paused: Story = {
  args: { current: { ...musicFixture(), playback: 'paused' } }
}
export const Pending: Story = { args: { pending: true } }
export const Empty: Story = {
  args: { current: null, children: 'Nenhuma música tocando' }
}
export const Demo: Story = { args: { demo: true } }
