import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { CalendarSettings } from './CalendarSettings'
const meta = {
  tags: ['autodocs'],
  title: 'Reminders/Calendar settings',
  component: CalendarSettings,
  args: {
    id: 'calendar-story',
    clientId: '',
    clientSecret: '',
    native: true,
    pending: false,
    error: '',
    status: { connected: false, connecting: false, error: null },
    onClientIdChange: fn(),
    onClientSecretChange: fn(),
    onConnect: fn(),
    onDisconnect: fn()
  }
} satisfies Meta<typeof CalendarSettings>
export default meta
type Story = StoryObj<typeof meta>
export const Disconnected: Story = {}
export const Connected: Story = {
  args: { status: { connected: true, connecting: false, error: null } }
}
export const Pending: Story = { args: { pending: true } }
export const Error: Story = { args: { error: 'OAuth failed' } }
export const Demo: Story = { args: { native: false } }
