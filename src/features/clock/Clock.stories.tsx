import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Clock } from './Clock'
import { clockFixture } from './fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Clock',
  component: Clock,
  args: {
    time: clockFixture(),
    showDate: true,
    describedBy: undefined,
    onClick: fn()
  }
} satisfies Meta<typeof Clock>
export default meta
type Story = StoryObj<typeof meta>
export const Label: Story = {}
export const Compact: Story = { args: { showDate: false } }
