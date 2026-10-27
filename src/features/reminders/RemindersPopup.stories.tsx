import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { RemindersPopup } from './reminders.popup'
import { ReminderEditorController } from './ReminderEditorController'
import { ActiveReminders } from './ActiveReminders'
import { remindersPopupFixture } from './fixtures'
const meta = {
  tags: ['autodocs'],
  title: 'Reminders/Popup',
  component: RemindersPopup,
  args: remindersPopupFixture()
} satisfies Meta<typeof RemindersPopup>
export default meta
type Story = StoryObj<typeof meta>
export const Interactive: Story = {
  render: function Interactive(args) {
    const [mode, setMode] = useState<'duration' | 'dateTime'>('duration')
    const [duration, setDuration] = useState('00:05')
    const [message, setMessage] = useState('Revisar o projeto')
    const [date, setDate] = useState<Date | undefined>(args.date)
    const [dateOpen, setDateOpen] = useState(false)
    const [open, setOpen] = useState(false)
    const [time, setTime] = useState('09:00')
    const [eventDuration, setEventDuration] = useState('30')
    return (
      <RemindersPopup
        {...args}
        mode={mode}
        duration={duration}
        date={date}
        dateOpen={dateOpen}
        time={time}
        eventDuration={eventDuration}
        fields={{
          ...args.fields,
          time: {
            ...args.fields.time,
            onChange: async (event) => setTime(event.target.value)
          },
          eventDuration: {
            ...args.fields.eventDuration,
            onChange: async (event) => setEventDuration(event.target.value)
          }
        }}
        onModeChange={(value) =>
          setMode(value === 'dateTime' ? 'dateTime' : 'duration')
        }
        onDurationChange={(event) => setDuration(event.target.value)}
        onAddMinutes={(minutes) => {
          const [hours, current] = duration.split(':').map(Number)
          const total = Math.min(1439, hours * 60 + current + minutes)
          setDuration(
            `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
          )
        }}
        onDateOpenChange={setDateOpen}
        onDateChange={(value) => {
          setDate(value)
          setDateOpen(false)
        }}
        editor={
          <ReminderEditorController
            id="story-message"
            value={message}
            onChange={setMessage}
            onBlur={() => {}}
            disabled={false}
            invalid={false}
            onSubmit={() => {}}
          />
        }
        activeReminders={
          <ActiveReminders
            activeCount={0}
            isOpen={open}
            onOpenChange={setOpen}
            items={null}
          />
        }
      />
    )
  }
}
export const Loading: Story = { args: { loaded: false } }
export const Pending: Story = { args: { pending: true } }
export const Error: Story = { args: { visibleError: 'IPC offline' } }
export const Calendar: Story = { args: { mode: 'dateTime', connected: true } }
