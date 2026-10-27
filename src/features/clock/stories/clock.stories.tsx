import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { clockFixture } from '../src/fixtures'
import { Clock } from '../widget/clock.widget'

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
