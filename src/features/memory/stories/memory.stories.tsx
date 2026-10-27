import { defaultView } from '@/components/status-bar/presentation'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { MEMORY_FIXTURE_TIME, memoryFixture } from '../src/fixtures'
import { Memory } from '../widget/memory.widget'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/RAM',
  component: Memory,
  args: {
    event: { status: 'ready', data: memoryFixture() },
    lastData: undefined,
    now: MEMORY_FIXTURE_TIME,
    format: defaultView.format,
    onClick: fn(),
    describedBy: undefined
  }
} satisfies Meta<typeof Memory>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Compact: Story = {
  args: { format: 'compact' }
}
export const Label: Story = {
  args: { format: 'label' }
}
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Unavailable: Story = {
  args: { event: { status: 'unavailable', data: null } }
}
export const Error: Story = {
  args: { event: { status: 'error', error: 'IPC offline' } }
}
export const Stale: Story = { args: { now: MEMORY_FIXTURE_TIME + 10000 } }
