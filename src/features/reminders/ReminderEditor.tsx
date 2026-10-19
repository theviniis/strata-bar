import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import { reminderEditorExtensions } from './editor-extensions'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export function ReminderEditor({
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
        class:
          'min-h-24 max-h-56 overflow-y-auto rounded-md border border-input bg-transparent p-3 text-sm outline-none focus:ring-2 focus:ring-ring [&_h1]:text-xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:whitespace-pre [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_code]:font-mono [&_a]:underline [&_blockquote]:my-2 [&_blockquote]:border-l-3 [&_blockquote]:border-primary/60 [&_blockquote]:bg-muted/50 [&_blockquote]:py-2 [&_blockquote]:pl-3 [&_blockquote]:pr-2 [&_blockquote]:text-foreground'
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
  useEffect(() => {
    editor?.view.dom.setAttribute('aria-invalid', String(invalid))
  }, [editor, invalid])
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
  return (
    <div
      ref={boundary}
      onKeyDown={(event) => {
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
      }}
    >
      <EditorContent editor={editor} />
      {editor && (
        <BubbleMenu
          editor={editor}
          appendTo={() => boundary.current!}
          options={{
            placement: 'top',
            flip: true,
            shift: () => ({
              crossAxis: true,
              padding: 8,
              boundary: boundary.current?.closest('[role="dialog"]') as
                HTMLElement | undefined
            })
          }}
          shouldShow={({ editor, state }) =>
            editor.isEditable &&
            !state.selection.empty &&
            (editor.isFocused ||
              !!boundary.current?.contains(document.activeElement))
          }
        >
          <div
            role="toolbar"
            aria-label="Formatação da mensagem"
            className="relative z-50 flex max-w-80 flex-wrap gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setLinkOpen(false)
                editor.commands.focus()
              }
            }}
          >
            {(
              [
                [
                  'Negrito',
                  state?.bold,
                  () => editor.chain().focus().toggleBold().run()
                ],
                [
                  'Itálico',
                  state?.italic,
                  () => editor.chain().focus().toggleItalic().run()
                ],
                [
                  'Tachado',
                  state?.strike,
                  () => editor.chain().focus().toggleStrike().run()
                ],
                [
                  'Código inline',
                  state?.code,
                  () => editor.chain().focus().toggleCode().run()
                ]
              ] as const
            ).map(([label, active, action]) => (
              <Button
                key={label}
                type="button"
                size="sm"
                variant="ghost"
                aria-pressed={!!active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={action}
              >
                {label}
              </Button>
            ))}
            <select
              aria-label="Tipo de bloco"
              value={state?.heading ?? 0}
              onChange={(e) => {
                const level = Number(e.target.value) as 0 | 1 | 2 | 3
                if (level) editor.chain().focus().setHeading({ level }).run()
                else editor.chain().focus().setParagraph().run()
              }}
            >
              <option value={0}>Parágrafo</option>
              <option value={1}>H1</option>
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setUrl(String(editor.getAttributes('link').href ?? ''))
                setLinkOpen(!linkOpen)
              }}
            >
              Link
            </Button>
            {linkOpen && (
              <div className="flex w-full flex-wrap gap-1">
                <input
                  aria-label="URL do link"
                  className="min-w-0 flex-1 rounded border border-input p-1"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      e.stopPropagation()
                      applyLink()
                    }
                  }}
                />
                <Button type="button" size="sm" onClick={applyLink}>
                  Aplicar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .extendMarkRange('link')
                      .unsetLink()
                      .run()
                    setLinkOpen(false)
                  }}
                >
                  Remover
                </Button>
                {linkError && <span role="alert">{linkError}</span>}
              </div>
            )}
          </div>
        </BubbleMenu>
      )}
    </div>
  )
}
