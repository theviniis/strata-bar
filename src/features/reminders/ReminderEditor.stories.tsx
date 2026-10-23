import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { ReminderEditor } from './ReminderEditor'
import { ReminderEditorController } from './ReminderEditorController'
const meta = {
  tags: ['autodocs'],
  title: 'Reminders/Editor',
  component: ReminderEditor
} satisfies Meta<typeof ReminderEditor>
export default meta
type Story = StoryObj
export const Interactive: Story = {
  render: function Interactive() {
    const [message, setMessage] = useState('**Revisar** o projeto')
    return (
      <ReminderEditorController
        id="editor-story"
        value={message}
        onChange={setMessage}
        onBlur={() => {}}
        disabled={false}
        invalid={false}
        onSubmit={() => {}}
      />
    )
  }
}
