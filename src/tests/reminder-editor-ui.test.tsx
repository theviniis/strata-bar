import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { expect, it, vi } from 'vitest'
import { ReminderEditorController as ReminderEditor } from '@/features/reminders/ReminderEditorController'

it('keeps Enter for editing, submits with Ctrl+Enter and respects IME', () => {
  const submit = vi.fn()
  render(
    <ReminderEditor
      id="message"
      value="Hello"
      onChange={() => {}}
      onBlur={() => {}}
      disabled={false}
      invalid={false}
      onSubmit={submit}
    />
  )
  const textbox = screen.getByRole('textbox', { name: 'Mensagem' })
  fireEvent.keyDown(textbox, { key: 'Enter' })
  expect(submit).not.toHaveBeenCalled()
  fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true, isComposing: true })
  expect(submit).not.toHaveBeenCalled()
  fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true })
  expect(submit).toHaveBeenCalledOnce()
})

it('reports formatted whitespace as empty and clears when the form resets', () => {
  const change = vi.fn()
  const props = {
    id: 'message',
    value: 'Draft',
    onChange: change,
    onBlur: () => {},
    disabled: false,
    invalid: false,
    onSubmit: () => {}
  }
  const { rerender } = render(<ReminderEditor {...props} />)
  const textbox = screen.getByRole('textbox', { name: 'Mensagem' })
  const editor = (textbox as HTMLElement & { editor: Editor }).editor
  act(() => {
    editor.commands.setContent('<h2><strong>   </strong></h2>')
  })
  expect(change).toHaveBeenLastCalledWith('')
  act(() => {
    editor.commands.setContent('<p>Draft again</p>')
  })
  rerender(<ReminderEditor {...props} value="" />)
  expect(textbox).toHaveTextContent('')
  expect(editor.isEmpty).toBe(true)
})

it('disables editing and submission while saving and exposes validation errors', () => {
  const submit = vi.fn()
  const change = vi.fn()
  render(
    <ReminderEditor
      id="message"
      value="Draft"
      onChange={change}
      onBlur={() => {}}
      disabled
      invalid
      onSubmit={submit}
    />
  )
  const textbox = screen.getByRole('textbox', { name: 'Mensagem' })
  expect(textbox).toHaveAttribute('contenteditable', 'false')
  expect(textbox).toHaveAttribute('aria-invalid', 'true')
  fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true })
  expect(submit).not.toHaveBeenCalled()
  expect(change).not.toHaveBeenCalled()
})
