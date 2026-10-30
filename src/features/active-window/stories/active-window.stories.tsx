import { defaultView } from '@/components/status-bar/presentation'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { activeWindowFixture } from '../src/fixtures'
import { ActiveWindow } from '../widget/active-window.widget'

const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Active Window',
  component: ActiveWindow,
  args: {
    event: { status: 'ready', data: activeWindowFixture() },
    format: defaultView.format,
    onClick: fn(),
    describedBy: undefined
  }
} satisfies Meta<typeof ActiveWindow>
export default meta

type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Compact: Story = { args: { format: 'compact' } }
export const Label: Story = { args: { format: 'label' } }
export const Loading: Story = { args: { event: { status: 'loading' } } }
export const Error: Story = {
  args: { event: { status: 'error', error: 'IPC offline' } }
}
