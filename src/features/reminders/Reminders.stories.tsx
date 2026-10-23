import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { Reminders } from './Reminders'
import { reminderFixture, REMINDER_FIXTURE_TIME } from './fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Widgets/Reminders',
  component: Reminders,
  args: {
    next: reminderFixture(),
    now: REMINDER_FIXTURE_TIME,
    ringing: false,
    error: null,
    format: 'label',
    onClick: fn()
  }
} satisfies Meta<typeof Reminders>
export default meta
type Story = StoryObj<typeof meta>
export const Scheduled: Story = {}
export const Compact: Story = { args: { format: 'compact' } }
export const Empty: Story = { args: { next: null } }
export const Ringing: Story = { args: { next: null, ringing: true } }
export const Error: Story = { args: { error: 'IPC offline' } }
