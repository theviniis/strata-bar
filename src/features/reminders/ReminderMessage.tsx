import { EditorContent, type Editor } from '@tiptap/react'

export function ReminderMessage({ editor }: { editor: Editor | null }) {
  return <EditorContent editor={editor} />
}
