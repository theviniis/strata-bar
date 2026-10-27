import { Button } from '@/components/ui/button'
import { useFocusBorder } from '@/components/ui/use-focus-border'
import { EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { ComponentProps, KeyboardEventHandler, Ref } from 'react'

export interface ReminderEditorProps {
  editor: Editor | null
  boundary: Ref<HTMLDivElement>
  linkOpen: boolean
  url: string
  linkError: string
  actions: { label: string; active: boolean; action: () => void }[]
  heading: number
  bubbleProps: Omit<ComponentProps<typeof BubbleMenu>, 'editor' | 'children'>
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onToolbarKeyDown: KeyboardEventHandler<HTMLDivElement>
  onHeadingChange: (value: string) => void
  onToggleLink: () => void
  onRemoveLink: () => void
  onUrlChange: (value: string) => void
  onApplyLink: () => void
  onLinkKeyDown: KeyboardEventHandler<HTMLInputElement>
}
export function ReminderEditor({
  editor,
  boundary,
  linkOpen,
  url,
  linkError,
  actions,
  heading,
  bubbleProps,
  onKeyDown,
  onToolbarKeyDown,
  onHeadingChange,
  onToggleLink,
  onRemoveLink,
  onUrlChange,
  onApplyLink,
  onLinkKeyDown
}: ReminderEditorProps) {
  const focusBorder = useFocusBorder<HTMLDivElement>()
  return (
    <div ref={boundary} onKeyDown={onKeyDown}>
      <EditorContent
        editor={editor}
        className="rounded-md border border-border/50"
        {...focusBorder}
      />
      {editor && (
        <BubbleMenu editor={editor} {...bubbleProps}>
          <div
            role="toolbar"
            aria-label="Formatação da mensagem"
            className="relative z-50 flex max-w-80 flex-wrap gap-1 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
            onKeyDown={onToolbarKeyDown}
          >
            {actions.map(({ label, active, action }) => (
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
              value={heading}
              onChange={(e) => onHeadingChange(e.target.value)}
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
              onClick={onToggleLink}
            >
              Link
            </Button>
            {linkOpen && (
              <div className="flex w-full flex-wrap gap-1">
                <input
                  aria-label="URL do link"
                  className="min-w-0 flex-1 rounded border border-input p-1"
                  value={url}
                  onChange={(e) => onUrlChange(e.target.value)}
                  onKeyDown={onLinkKeyDown}
                />
                <Button type="button" size="sm" onClick={onApplyLink}>
                  Aplicar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={onRemoveLink}
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
