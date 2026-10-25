import type { Meta, StoryObj } from '@storybook/react-vite'
import { MediaSpectrum } from './MediaSpectrum'
import { demoSpectrum } from '@/services/system/media-spectrum'

const meta = {
  title: 'Widgets/MediaSpectrum',
  component: MediaSpectrum,
  tags: ['autodocs'],
  args: { data: demoSpectrum(), demo: true }
} satisfies Meta<typeof MediaSpectrum>
export default meta
type Story = StoryObj<typeof meta>
export const Demonstration: Story = {}
export const Muted: Story = {
  args: { data: { ...demoSpectrum(), bands: [0, 0, 0, 0, 0, 0] } }
}
export const PausedOrUnavailable: Story = { args: { data: null } }
