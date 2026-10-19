import { EditorContent, useEditor } from '@tiptap/react'
import { memo, useEffect } from 'react'
import { reminderEditorExtensions } from './editor-extensions'

/** Read-only Markdown using the same parser and schema as the message editor. */
export const ReminderMessage = memo(function ReminderMessage({
  message
}: {
  message: string
}) {
  const editor = useEditor({
    extensions: reminderEditorExtensions,
    content: message,
    contentType: 'markdown',
    editable: false,
    editorProps: {
      attributes: {
        class:
          'min-w-0 wrap-break-word text-sm [&_p+p]:mt-2 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_code]:font-mono [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-primary/60 [&_blockquote]:bg-muted/50 [&_blockquote]:py-2 [&_blockquote]:pl-3 [&_blockquote]:pr-2'
      }
    }
  })
  useEffect(() => {
    if (editor && message !== editor.getMarkdown()) {
      editor.commands.setContent(message, {
        contentType: 'markdown',
        emitUpdate: false
      })
    }
  }, [editor, message])
  return <EditorContent editor={editor} />
})
