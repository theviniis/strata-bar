import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Microphone } from './Microphone'
import { audioLevelFixture } from '@/features/audio/fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Microphone',
  component: Microphone,
  args: {
    event: { status: 'ready', data: audioLevelFixture() },
    describedBy: undefined,
    onClick: fn()
  }
} satisfies Meta<typeof Microphone>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Muted: Story = {
  args: { event: { status: 'ready', data: { level: 64, muted: true } } }
}
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Unavailable: Story = {
  args: { event: { status: 'unavailable', data: null } }
}
export const Error: Story = {
  args: { event: { status: 'error', error: 'Audio unavailable' } }
}
