import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Editor } from '@tiptap/react'
import { Fragment, StrictMode, Suspense } from 'react'
import { expect, it, vi } from 'vitest'
import { ReminderEditorController as ReminderEditor } from '@/features/reminders/src/reminder-editor-controller'

it.each([false, true])(
  'mounts after suspension and reopens with live validation (StrictMode=%s)',
  async (strict) => {
    let ready = false
    let release!: () => void
    let pending = new Promise<void>((resolve) => {
      release = resolve
    })
    function LoadingGate() {
      if (!ready) throw pending
      return null
    }
    const Wrapper = strict ? StrictMode : Fragment
    const props = {
      id: 'message',
      value: 'Draft',
      onChange: vi.fn(),
      onBlur: vi.fn(),
      disabled: false,
      invalid: false,
      onSubmit: vi.fn()
    }
    const content = (open: boolean, invalid = false) => (
      <Wrapper>
        <Suspense fallback={<p>Loading editor</p>}>
          {open && <ReminderEditor {...props} invalid={invalid} />}
          <LoadingGate />
        </Suspense>
      </Wrapper>
    )
    const { rerender } = render(content(true))
    expect(screen.getByText('Loading editor')).toBeInTheDocument()
    await act(async () => {
      ready = true
      release()
      await pending
    })
    const textbox = screen.getByRole('textbox', { name: 'Mensagem' })
    expect(textbox).toHaveAttribute('aria-invalid', 'false')
    // Suspense disconnects effects while hidden; Tiptap may destroy its view
    // before React reconnects those effects on the retained editor instance.
    ready = false
    pending = new Promise<void>((resolve) => {
      release = resolve
    })
    rerender(content(true))
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    await act(async () => {
      ready = true
      release()
      await pending
    })
    rerender(content(true, true))
    expect(textbox).toHaveAttribute('aria-invalid', 'true')
    rerender(content(true, false))
    expect(textbox).toHaveAttribute('aria-invalid', 'false')
    rerender(content(false))
    expect(screen.queryByRole('textbox', { name: 'Mensagem' })).toBeNull()
    rerender(content(true))
    expect(screen.getByRole('textbox', { name: 'Mensagem' })).toHaveTextContent(
      'Draft'
    )
  }
)

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
