import { MonitorWidgetInspector } from './MonitorWidgetInspector'
import { WidgetPreview } from '@/components/status-bar/WidgetPreview'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
  ItemTitle
} from '@/components/ui/item'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { GripVertical, Trash2 } from 'lucide-react'
import { LayoutGroup, motion, MotionConfig } from 'motion/react'
import { useId, useState, type ComponentProps } from 'react'
import { createPortal } from 'react-dom'
import {
  addableTypes,
  addWidget,
  findWidget,
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
  onInspect?(id: string): void
}

/**
 * The three ordered bar sections as sortable columns. A drag inside a column
 * reorders it; dropping on another column moves the widget across sections.
 * Dragging projects a temporary layout, committed to the draft only on drop.
 * Cancel restores the original layout. Generated IDs are checked across all
 * three columns before use.
 *
 * The keyboard sensor and the explicit "Mover para" select are the accessible
 * paths; the tests drive those, never drag internals.
 */
export function LayoutEditor({ draft, onChange, disabled }: LayoutEditorProps) {
  const [selected, setSelected] = useState<string | null>(null)
  const selectedLocation = selected ? findWidget(draft, selected) : undefined
  const selectedWidget = selectedLocation
    ? draft.widgets[selectedLocation.section][selectedLocation.index]
    : undefined
  const layoutId = useId()
  const [drag, setDrag] = useState<{ id: string; config: Config } | null>(null)
  const display = drag?.config ?? draft
  const location = drag ? findWidget(display, drag.id) : undefined
  const activeWidget = location
    ? display.widgets[location.section][location.index]
    : undefined
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragEnd(event: DragEndEvent) {
    setDrag(null)
    const { active, over } = event
    if (!over || !drag) return
    if (!(event.activatorEvent instanceof KeyboardEvent)) {
      if (drag.config !== draft) onChange(drag.config)
      return
    }
    if (active.id === over.id) return
    const overId = String(over.id)
    const target = dropTarget(draft, overId)
    if (!target) return
    const next = moveWidget(draft, String(active.id), target)
    if (next !== draft) onChange(next)
  }

  function previewMove(event: DragMoveEvent) {
    const { active, over, activatorEvent, delta } = event
    if (
      !over ||
      active.id === over.id ||
      !(activatorEvent instanceof MouseEvent)
    )
      return
    const pointerY = activatorEvent.clientY + delta.y
    setDrag((current) => {
      if (!current) return current
      const from = findWidget(current.config, String(active.id))
      const overId = String(over.id)
      const target = dropTarget(current.config, overId)
      if (!from || !target) return current
      let index = target.index
      if (
        !overId.startsWith('section:') &&
        pointerY > over.rect.top + over.rect.height / 2
      )
        index += 1
      if (from.section === target.section && from.index < index) index -= 1
      if (from.section === target.section && from.index === index)
        return current
      return {
        ...current,
        config: moveWidget(current.config, String(active.id), {
          section: target.section,
          index
        })
      }
    })
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={layoutCollision}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={({ active }) =>
        setDrag({ id: String(active.id), config: draft })
      }
      onDragCancel={() => setDrag(null)}
      onDragOver={previewMove}
      onDragMove={previewMove}
      onDragEnd={onDragEnd}
    >
      <MotionConfig reducedMotion="user">
        <LayoutGroup id={layoutId}>
          <div className="grid gap-4 md:grid-cols-3">
            {sections.map((section) => (
              <SectionColumn
                key={section}
                section={section}
                widgets={display.widgets[section]}
                draft={display}
                onChange={onChange}
                disabled={disabled}
                onInspect={setSelected}
              />
            ))}
          </div>
          {selectedWidget && (
            <fieldset disabled={disabled} className="mt-6">
              <MonitorWidgetInspector
                key={selectedWidget.id}
                widget={selectedWidget}
                draft={draft}
                onChange={onChange}
              />
            </fieldset>
          )}
        </LayoutGroup>
      </MotionConfig>
      {createPortal(
        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeWidget && (
            <div
              role="img"
              aria-label={`Movendo ${typeLabels[activeWidget.type]}`}
              className="rounded-md bg-card shadow-lg"
            >
              <WidgetCard
                widget={activeWidget}
                draft={display}
                onChange={onChange}
                disabled
              />
            </div>
          )}
        </DragOverlay>,
        document.body
      )}
    </DndContext>
  )
}

function dropTarget(config: Config, id: string) {
  if (!id.startsWith('section:')) return findWidget(config, id)
  const section = id.slice('section:'.length) as Section
  return { section, index: config.widgets[section].length }
}

// Pointer drops use the item or section actually under the cursor. Keyboard
// sorting keeps the library's distance-based navigation between targets.
const layoutCollision: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCenter(args)
  const hits = pointerWithin(args)
  const items = hits.filter(({ id }) => !String(id).startsWith('section:'))
  if (items.length) return items
  const section = hits[0]
  if (!section) return []
  // Gaps and column padding use the nearest item, not an implicit append.
  const candidates = args.droppableContainers.flatMap((container) => {
    if (container.data.current?.sortable?.containerId !== section.id) return []
    const rect = args.droppableRects.get(container.id)
    return rect
      ? [
          {
            id: container.id,
            distance: Math.abs(
              args.pointerCoordinates!.y - (rect.top + rect.height / 2)
            )
          }
        ]
      : []
  })
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates.length ? [{ id: candidates[0].id }] : hits
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
  disabled,
  onInspect
}: SectionColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `section:${section}` })
  const { over } = useDndContext()
  const isOverSection =
    isOver ||
    (over !== null && findWidget(draft, String(over.id))?.section === section)
  return (
    <Card
      ref={setNodeRef}
      role="region"
      aria-label={`Seção ${sectionLabels[section]}`}
      data-section={section}
      data-drag-over={isOverSection}
      className="min-w-0 data-[drag-over=true]:ring-2 data-[drag-over=true]:ring-ring"
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
          id={`section:${section}`}
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
                onInspect={onInspect}
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
          disabled={disabled}
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
  disabled,
  onInspect
}: SortableWidgetProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: widget.id,
    disabled
  })
  return (
    <li
      ref={setNodeRef}
      className={cn(isDragging && 'opacity-30')}
      data-widget={widget.id}
      data-dragging={isDragging || undefined}
    >
      {/* Keep the measured drop target stationary while its contents animate. */}
      <motion.div
        layout={isDragging ? false : 'position'}
        initial={false}
        transition={{ layout: { duration: 0.16, ease: 'easeOut' } }}
      >
        <WidgetCard
          widget={widget}
          draft={draft}
          onChange={onChange}
          disabled={disabled}
          onInspect={onInspect}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </motion.div>
    </li>
  )
}

function WidgetCard({
  widget,
  draft,
  onChange,
  disabled,
  dragHandleProps,
  onInspect
}: SortableWidgetProps & {
  dragHandleProps?: ComponentProps<typeof Button>
}) {
  return (
    <Item variant="outline" size="sm">
      <ItemHeader>
        <div className="flex min-w-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="cursor-grab touch-none"
            disabled={disabled}
            aria-label={`Mover ${typeLabels[widget.type]}`}
            {...dragHandleProps}
          >
            <GripVertical aria-hidden="true" />
          </Button>
          <Checkbox
            disabled={disabled}
            aria-label={`Ativar ${typeLabels[widget.type]}`}
            checked={widget.enabled}
            onCheckedChange={() => onChange(toggleWidget(draft, widget.id))}
          />
          <ItemTitle
            className="block max-w-full truncate"
            title={typeLabels[widget.type]}
          >
            {typeLabels[widget.type]}
          </ItemTitle>
        </div>
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          disabled={disabled}
          aria-label={`Remover ${typeLabels[widget.type]}`}
          onClick={() => onChange(removeWidget(draft, widget.id))}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </ItemHeader>
      <ItemContent className="min-w-0 basis-full">
        <WidgetPreview widget={widget} theme={draft.bar.theme} />
      </ItemContent>
      <ItemFooter>
        {onInspect && (
          <Button
            disabled={disabled}
            variant="outline"
            size="sm"
            aria-label={`Configurar ${typeLabels[widget.type]}`}
            onClick={() => onInspect(widget.id)}
          >
            Configurar
          </Button>
        )}
        <Select
          disabled={disabled}
          items={sections.map((section) => ({
            value: section,
            label: sectionLabels[section]
          }))}
          value={findWidget(draft, widget.id)?.section ?? 'left'}
          onValueChange={(value) => {
            const section = sections.find((section) => section === value)
            if (section)
              onChange(
                moveWidget(draft, widget.id, {
                  section,
                  index: draft.widgets[section].length
                })
              )
          }}
        >
          <SelectTrigger aria-label={`Mover ${typeLabels[widget.type]} para`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {sections.map((section) => (
                <SelectItem key={section} value={section}>
                  {sectionLabels[section]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </ItemFooter>
    </Item>
  )
}

function AddWidget({
  label,
  section,
  draft,
  onChange,
  disabled
}: LayoutEditorProps & { label: string; section: Section }) {
  return (
    <Select
      disabled={disabled}
      items={addableTypes().map((type) => ({
        value: type,
        label: typeLabels[type]
      }))}
      value={null}
      onValueChange={(value) => {
        const type = addableTypes().find((type) => type === value)
        if (type) onChange(addWidget(draft, type, section))
      }}
    >
      <SelectTrigger aria-label={label}>
        <SelectValue placeholder="Adicionar widget..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {addableTypes().map((type) => (
            <SelectItem key={type} value={type}>
              {typeLabels[type]}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
