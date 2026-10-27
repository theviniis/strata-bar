import { Editor } from '@tiptap/react'
import { afterEach, expect, it } from 'vitest'
import { reminderEditorExtensions } from '@/features/reminders/src/editor-extensions'
import { reminderFormSchema } from '@/features/reminders/src/form'

let editor: Editor
function create(content = '') {
  editor = new Editor({
    extensions: reminderEditorExtensions,
    content,
    contentType: 'markdown'
  })
  return editor
}
afterEach(() => editor?.destroy())

it.each([
  ['##', 'heading'],
  ['-', 'bulletList'],
  ['*', 'bulletList'],
  ['1.', 'orderedList'],
  ['```', 'codeBlock']
])('converts %s followed by space through input rules', (shortcut, node) => {
  create()
  editor.commands.insertContent(shortcut)
  const { from, to } = editor.state.selection
  editor.view.someProp('handleTextInput', (handler) =>
    handler(editor.view, from, to, ' ', () => editor.state.tr.insertText(' '))
  )
  expect(editor.isActive(node)).toBe(true)
  expect(editor.commands.undo()).toBe(true)
})

it('rejects empty documents and raw messages beyond the limit', () => {
  const schema = reminderFormSchema.shape.message
  expect(schema.safeParse(create().getMarkdown()).success).toBe(false)
  expect(schema.safeParse('a'.repeat(2001)).success).toBe(false)
})

it.each([
  '## Título\n\nParágrafo',
  '- Primeiro\n- Segundo',
  '1. Primeiro\n2. Segundo',
  '**Negrito** e *itálico* e ~~tachado~~ e `inline`',
  '[Site](https://example.com) e [Email](mailto:test@example.com)',
  '```rust\n  let x = 1;\n\n    x\n```'
])('preserves supported Markdown through reload: %s', (markdown) => {
  create(markdown)
  // Apply the trailing-paragraph plugin before comparing document structure.
  editor.commands.setContent(markdown, { contentType: 'markdown' })
  const document = editor.getJSON()
  const raw = editor.getMarkdown()
  editor.commands.setContent(raw, { contentType: 'markdown' })
  expect(editor.getJSON()).toEqual(document)
  expect(editor.getMarkdown()).toBe(raw)
  if (markdown.startsWith('```')) {
    expect(editor.getText()).toContain('  let x = 1;\n\n    x')
    expect(raw).toContain('```rust')
  }
})
