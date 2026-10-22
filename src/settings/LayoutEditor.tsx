import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import type {
  Config,
  WidgetConfig,
  WidgetType
} from '@/services/configuration/config'
import {
  addWidget,
  addableTypes,
  moveWidget,
  removeWidget,
  sectionLabels,
  sections,
  toggleWidget,
  typeLabels,
  type Section
} from './layout'

interface LayoutEditorProps {
  draft: Config
  onChange(next: Config): void
}

/**
 * The three ordered bar sections as sortable columns. A drag inside a column
 * reorders it; dropping on another column moves the widget across sections.
 * Every mutation installs a new document in the draft, so what is on screen is
 * always the draft, and a generated ID is checked against all three columns
 * before it is used.
 *
 * The keyboard sensor and the explicit "Mover para" select are the accessible
 * paths; the tests drive those, never drag internals.
 */
export function LayoutEditor({ draft, onChange }: LayoutEditorProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return
    const overId = String(over.id)
    const target = overId.startsWith('section:')
      ? {
          section: overId.slice('section:'.length) as Section,
          index:
            draft.widgets[overId.slice('section:'.length) as Section].length
        }
      : locate(draft, overId)
    if (!target) return
    const next = moveWidget(draft, String(active.id), target)
    if (next !== draft) onChange(next)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <SectionColumn
            key={section}
            section={section}
            widgets={draft.widgets[section]}
            draft={draft}
            onChange={onChange}
          />
        ))}
      </div>
    </DndContext>
  )
}

function locate(draft: Config, id: string) {
  for (const section of sections) {
    const index = draft.widgets[section].findIndex((w) => w.id === id)
    if (index >= 0) return { section, index }
  }
  return undefined
}

interface SectionColumnProps extends LayoutEditorProps {
  section: Section
  widgets: WidgetConfig[]
}

function SectionColumn({
  section,
  widgets,
  draft,
  onChange
}: SectionColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section}` })
  return (
    <section
      ref={setNodeRef}
      aria-label={`Seção ${sectionLabels[section]}`}
      data-section={section}
      className={`flex min-h-32 flex-col gap-2 rounded-lg border border-border bg-card p-3 ${
        isOver ? 'ring-2 ring-ring' : ''
      }`}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{sectionLabels[section]}</h3>
        <AddWidget
          label={`Adicionar widget em ${sectionLabels[section]}`}
          section={section}
          draft={draft}
          onChange={onChange}
        />
      </header>
      <SortableContext
        items={widgets.map((widget) => widget.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul className="flex flex-col gap-1.5">
          {widgets.map((widget) => (
            <SortableWidget
              key={widget.id}
              widget={widget}
              draft={draft}
              onChange={onChange}
            />
          ))}
        </ul>
      </SortableContext>
      {widgets.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum widget aqui.</p>
      )}
    </section>
  )
}

interface SortableWidgetProps extends LayoutEditorProps {
  widget: WidgetConfig
}

function SortableWidget({ widget, draft, onChange }: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: widget.id })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-widget={widget.id}
      data-dragging={isDragging || undefined}
      className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5"
    >
      <button
        type="button"
        className="cursor-grab touch-manipulation text-muted-foreground"
        aria-label={`Mover ${typeLabels[widget.type]}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <Checkbox
        aria-label={`Ativar ${typeLabels[widget.type]}`}
        checked={widget.enabled}
        onCheckedChange={() => onChange(toggleWidget(draft, widget.id))}
      />
      <span className="min-w-0 flex-1 truncate text-xs" title={widget.id}>
        {typeLabels[widget.type]}
        <span className="ml-1 text-muted-foreground">({widget.id})</span>
      </span>
      <SectionSelect widget={widget} draft={draft} onChange={onChange} />
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        aria-label={`Remover ${typeLabels[widget.type]}`}
        onClick={() => onChange(removeWidget(draft, widget.id))}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </li>
  )
}

/** Keyboard/pointer-free equivalent of a cross-column drag. */
function SectionSelect({ widget, draft, onChange }: SortableWidgetProps) {
  const current = locate(draft, widget.id)?.section ?? 'left'
  return (
    <select
      aria-label={`Mover ${typeLabels[widget.type]} para`}
      className="cursor-pointer rounded border border-input bg-transparent px-1 py-0.5 text-[11px]"
      value={current}
      onChange={(event) =>
        onChange(
          moveWidget(draft, widget.id, {
            section: event.target.value as Section,
            index: draft.widgets[event.target.value as Section].length
          })
        )
      }
    >
      {sections.map((section) => (
        <option key={section} value={section}>
          {sectionLabels[section]}
        </option>
      ))}
    </select>
  )
}

function AddWidget({
  label,
  section,
  draft,
  onChange
}: LayoutEditorProps & { label: string; section: Section }) {
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer touch-manipulation list-none items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
        aria-label={label}
      >
        <Plus className="size-3" aria-hidden="true" /> Adicionar
      </summary>
      <ul className="absolute right-0 z-10 mt-1 grid max-h-64 w-44 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
        {addableTypes().map((type) => (
          <li key={type}>
            <button
              type="button"
              className="w-full cursor-pointer rounded px-2 py-1 text-left text-xs hover:bg-muted"
              aria-label={`Adicionar ${typeLabels[type]} em ${sectionLabels[section]}`}
              onClick={() =>
                onChange(addWidget(draft, type as WidgetType, section))
              }
            >
              {typeLabels[type]}
            </button>
          </li>
        ))}
      </ul>
    </details>
  )
}
