import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'

export const reminderEditorExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, protocols: ['http', 'https', 'mailto'] }
  }),
  Markdown
]
