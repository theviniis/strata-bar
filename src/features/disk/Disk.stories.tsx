import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { defaultView } from '@/components/status-bar/presentation'
import { Disk } from './Disk'
import { diskFixture, DISK_FIXTURE_TIME } from './fixtures'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Discos',
  component: Disk,
  args: {
    event: { status: 'ready', data: diskFixture() },
    lastData: undefined,
    now: DISK_FIXTURE_TIME,
    format: defaultView.format,
    onClick: fn(),
    describedBy: undefined
  }
} satisfies Meta<typeof Disk>
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
export const Stale: Story = { args: { now: DISK_FIXTURE_TIME + 10000 } }
