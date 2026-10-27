import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { ReminderAlert } from './reminderAlert.popup'
import { ReminderAlertActions } from './ReminderAlertActions'
import { ReminderMessageController } from './ReminderMessageController'
import { reminderFixture } from './fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Reminders/Alert',
  component: ReminderAlert,
  args: {
    synchronized: true,
    reminder: { ...reminderFixture(), status: 'ringing' },
    error: null,
    source: 'demo',
    close: fn(),
    message: <ReminderMessageController message={reminderFixture().message} />,
    actions: (
      <ReminderAlertActions
        inputId="alert-story"
        option="5"
        pending={false}
        error={null}
        onOptionChange={fn()}
        onSnooze={fn()}
        onDismiss={fn()}
      />
    )
  }
} satisfies Meta<typeof ReminderAlert>
export default meta
type Story = StoryObj<typeof meta>
export const Ringing: Story = {}
export const Loading: Story = { args: { synchronized: false } }
export const Error: Story = {
  args: { synchronized: false, error: 'IPC offline' }
}
