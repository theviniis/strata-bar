import type { SnoozeOption } from '@/services/system/reminders.generated'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { fn } from 'storybook/test'
import { ReminderAlertActions } from '../src/reminder-alert-actions'
const meta = {
  tags: ['autodocs'],
  title: 'Reminders/Alert actions',
  component: ReminderAlertActions,
  args: {
    inputId: 'snooze-story',
    option: '5',
    pending: false,
    error: null,
    onOptionChange: fn(),
    onSnooze: fn(),
    onDismiss: fn()
  }
} satisfies Meta<typeof ReminderAlertActions>
export default meta
type Story = StoryObj<typeof meta>
export const Ready: Story = {}
export const Pending: Story = { args: { pending: true } }
export const Error: Story = { args: { error: 'IPC offline' } }
export const Interactive: Story = {
  render: function Interactive(args) {
    const [option, setOption] = useState<SnoozeOption>('5')
    return (
      <ReminderAlertActions
        {...args}
        option={option}
        onOptionChange={setOption}
      />
    )
  }
}
