import { useEditor, useEditorState } from '@tiptap/react'
import type { BubbleMenu } from '@tiptap/react/menus'
import { reminderEditorExtensions } from './editor-extensions'
import { useEffect, useRef, useState } from 'react'
import type { ComponentProps, KeyboardEventHandler } from 'react'
import { ReminderEditor } from './ReminderEditor'

export function ReminderEditorController({
  id,
  value,
  onChange,
  onBlur,
  disabled,
  invalid,
  onSubmit
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  disabled: boolean
  invalid: boolean
  onSubmit: () => void
}) {
  const boundary = useRef<HTMLDivElement>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState('')
  const [linkError, setLinkError] = useState('')
  const editor = useEditor({
    extensions: reminderEditorExtensions,
    content: value,
    contentType: 'markdown',
    onUpdate: ({ editor }) =>
      onChange(editor.getText().trim() ? editor.getMarkdown() : ''),
    onBlur,
    editorProps: {
      attributes: {
        id,
        role: 'textbox',
        'aria-label': 'Mensagem',
        'aria-multiline': 'true',
        'aria-required': 'true',
        'aria-invalid': String(invalid),
        class:
          'min-h-24 max-h-56 overflow-y-auto rounded-md border border-input bg-transparent p-3 text-body outline-none focus:ring-2 focus:ring-ring [&_h1]:text-page [&_h1]:font-bold [&_h2]:text-title [&_h2]:font-bold [&_h3]:text-subtitle [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_code]:font-mono [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-primary/60 [&_blockquote]:bg-muted/50 [&_blockquote]:py-2 [&_blockquote]:pl-3 [&_blockquote]:pr-2 [&_blockquote]:text-foreground'
      }
    }
  })
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive('bold'),
      italic: editor?.isActive('italic'),
      strike: editor?.isActive('strike'),
      code: editor?.isActive('code'),
      heading:
        [1, 2, 3].find((level) => editor?.isActive('heading', { level })) ?? 0
    })
  })
  useEffect(() => {
    editor?.setEditable(!disabled, false)
  }, [editor, disabled])
  useEffect(() => {
    if (
      editor &&
      value !== editor.getMarkdown() &&
      !(value === '' && editor.isEmpty)
    ) {
      editor.commands.setContent(value, {
        contentType: 'markdown',
        emitUpdate: false
      })
    }
  }, [editor, value])
  const applyLink = () => {
    if (!/^(https?:\/\/|mailto:)/i.test(url.trim())) {
      setLinkError('Use um link HTTP, HTTPS ou mailto')
      return
    }
    editor
      ?.chain()
      .focus()
      .extendMarkRange('link')
      .setLink({ href: url.trim() })
      .run()
    setLinkOpen(false)
    setLinkError('')
  }
  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (
      event.key === 'Enter' &&
      event.ctrlKey &&
      !event.nativeEvent.isComposing &&
      !linkOpen
    ) {
      event.preventDefault()
      event.stopPropagation()
      if (!disabled) onSubmit()
    }
  }
  const bubbleProps: Omit<
    ComponentProps<typeof BubbleMenu>,
    'editor' | 'children'
  > = {
    appendTo: () => boundary.current!,
    options: {
      placement: 'top',
      flip: true,
      shift: () => ({
        crossAxis: true,
        padding: 8,
        boundary: boundary.current?.closest('[role="dialog"]') as
          HTMLElement | undefined
      })
    },
    shouldShow: ({ editor, state }) =>
      editor.isEditable &&
      !state.selection.empty &&
      (editor.isFocused || !!boundary.current?.contains(document.activeElement))
  }
  const onToolbarKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setLinkOpen(false)
      editor?.commands.focus()
    }
  }
  const actions = [
    {
      label: 'Negrito',
      active: !!state?.bold,
      action: () => editor?.chain().focus().toggleBold().run()
    },
    {
      label: 'It\u00e1lico',
      active: !!state?.italic,
      action: () => editor?.chain().focus().toggleItalic().run()
    },
    {
      label: 'Tachado',
      active: !!state?.strike,
      action: () => editor?.chain().focus().toggleStrike().run()
    },
    {
      label: 'C\u00f3digo inline',
      active: !!state?.code,
      action: () => editor?.chain().focus().toggleCode().run()
    }
  ]
  const onHeadingChange = (value: string) => {
    const level = Number(value)
    if (level === 1 || level === 2 || level === 3)
      editor?.chain().focus().setHeading({ level }).run()
    else editor?.chain().focus().setParagraph().run()
  }
  const onToggleLink = () => {
    setUrl(String(editor?.getAttributes('link').href ?? ''))
    setLinkOpen(!linkOpen)
  }
  const onRemoveLink = () => {
    editor?.chain().focus().extendMarkRange('link').unsetLink().run()
    setLinkOpen(false)
  }
  const onLinkKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      applyLink()
    }
  }
  return (
    <ReminderEditor
      editor={editor}
      boundary={boundary}
      linkOpen={linkOpen}
      url={url}
      linkError={linkError}
      actions={actions}
      heading={state?.heading ?? 0}
      bubbleProps={bubbleProps}
      onKeyDown={onKeyDown}
      onToolbarKeyDown={onToolbarKeyDown}
      onHeadingChange={onHeadingChange}
      onToggleLink={onToggleLink}
      onRemoveLink={onRemoveLink}
      onUrlChange={setUrl}
      onApplyLink={applyLink}
      onLinkKeyDown={onLinkKeyDown}
    />
  )
}
