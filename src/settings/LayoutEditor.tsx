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
import { GripVertical, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemTitle
} from '@/components/ui/item'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
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
  disabled?: boolean
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
export function LayoutEditor({ draft, onChange, disabled }: LayoutEditorProps) {
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
            disabled={disabled}
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
  onChange,
  disabled
}: SectionColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section}` })
  return (
    <Card
      ref={setNodeRef}
      role="region"
      aria-label={`Seção ${sectionLabels[section]}`}
      data-section={section}
      className={cn('min-w-0', isOver && 'ring-2 ring-ring')}
    >
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          {sectionLabels[section]}
        </CardTitle>
        <CardDescription>
          {widgets.length} {widgets.length === 1 ? 'widget' : 'widgets'}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                disabled={disabled}
              />
            ))}
          </ul>
        </SortableContext>
        {widgets.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyDescription>Nenhum widget aqui.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
      <CardFooter>
        <AddWidget
          label={`Adicionar widget em ${sectionLabels[section]}`}
          section={section}
          draft={draft}
          onChange={onChange}
        />
      </CardFooter>
    </Card>
  )
}

interface SortableWidgetProps extends LayoutEditorProps {
  widget: WidgetConfig
}

function SortableWidget({
  widget,
  draft,
  onChange,
  disabled
}: SortableWidgetProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: widget.id, disabled })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-widget={widget.id}
      data-dragging={isDragging || undefined}
    >
      <Item variant="outline" size="sm">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="cursor-grab touch-none"
          aria-label={`Mover ${typeLabels[widget.type]}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" />
        </Button>
        <Checkbox
          aria-label={`Ativar ${typeLabels[widget.type]}`}
          checked={widget.enabled}
          onCheckedChange={() => onChange(toggleWidget(draft, widget.id))}
        />
        <ItemContent className="min-w-0">
          <ItemTitle>{typeLabels[widget.type]}</ItemTitle>
          <ItemDescription title={widget.id}>{widget.id}</ItemDescription>
        </ItemContent>
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
      </Item>
    </li>
  )
}

/** Keyboard/pointer-free equivalent of a cross-column drag. */
function SectionSelect({ widget, draft, onChange }: SortableWidgetProps) {
  const current = locate(draft, widget.id)?.section ?? 'left'
  return (
    <NativeSelect
      size="sm"
      aria-label={`Mover ${typeLabels[widget.type]} para`}
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
        <NativeSelectOption key={section} value={section}>
          {sectionLabels[section]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function AddWidget({
  label,
  section,
  draft,
  onChange
}: LayoutEditorProps & { label: string; section: Section }) {
  return (
    <NativeSelect
      aria-label={label}
      value=""
      onChange={(event) => {
        const type = addableTypes().find((type) => type === event.target.value)
        if (type) onChange(addWidget(draft, type, section))
      }}
    >
      <NativeSelectOption value="" disabled>
        Adicionar widget…
      </NativeSelectOption>
      {addableTypes().map((type) => (
        <NativeSelectOption key={type} value={type}>
          {typeLabels[type]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
