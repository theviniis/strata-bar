import { WidgetPreview } from '@/components/status-bar/widget-preview'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader } from '@/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemHeader,
  ItemTitle
} from '@/components/ui/item'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import { normalizeMonitorName } from '@/services/configuration/config'
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
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Settings,
  Trash2
} from 'lucide-react'
import { LayoutGroup, motion, MotionConfig } from 'motion/react'
import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps
} from 'react'
import { createPortal } from 'react-dom'
import {
  findWidget,
  sectionLabels,
  sections,
  typeLabels,
  type Section
} from './layout'
import { ManagerContext, type ColumnMoveFocus } from './manager-context'
import {
  editMonitorDraft,
  type MonitorDraft,
  type MonitorLayoutMove
} from './monitor-layout'
import { MonitorWidgetInspector } from './monitor-widget-inspector'
import {
  readNavigation,
  rememberNavigation,
  type SettingsNavigation
} from './navigation'
import { useMonitors } from './use-monitors'
import { WidgetCatalog } from './widget-catalog'

interface LayoutEditorProps {
  disabled?: boolean
  draft: Config
  onChange(next: Config): void
}

/**
 * The three ordered bar sections as sortable columns. A drag inside a column
 * reorders it; dropping on another column moves the widget across sections.
 * Dragging projects a temporary layout, committed to the draft only on drop.
 * Cancel restores the original layout. Generated IDs are checked across all
 * three columns before use.
 *
 * The keyboard sensor and the explicit column arrow buttons are the accessible
 * paths; the tests drive those, never drag internals.
 */
export function LayoutEditor({
  draft: source,
  onChange: commit,
  disabled
}: LayoutEditorProps) {
  const { monitors, error, refresh, loading } = useMonitors()
  const [selection, setSelection] = useState<SettingsNavigation['monitor']>(
    () => readNavigation().monitor
  )
  const { choices, disconnected } = useMemo(() => {
    const connectedIds = new Set(
      monitors.map((m) => normalizeMonitorName(m.id))
    )
    const disconnected = Object.keys(source.monitors).filter(
      (id) => !connectedIds.has(normalizeMonitorName(id))
    )
    return {
      disconnected,
      choices: [
        ...monitors.map((monitor) => ({ id: monitor.id, connected: true })),
        ...disconnected.map((id) => ({ id, connected: false }))
      ]
    }
  }, [monitors, source.monitors])
  const selected =
    choices.find(
      (choice) =>
        selection &&
        normalizeMonitorName(choice.id) === normalizeMonitorName(selection.id)
    ) ?? (!loading && !error ? choices[0] : undefined)
  const [disconnectedNotice, setDisconnectedNotice] = useState(false)
  if (!disabled && !loading && !error) {
    const next = selected ?? null
    if (
      selection?.connected &&
      !choices.some(
        (choice) =>
          choice.connected &&
          normalizeMonitorName(choice.id) === normalizeMonitorName(selection.id)
      )
    )
      setDisconnectedNotice(true)
    if (selection?.id !== next?.id || selection?.connected !== next?.connected)
      setSelection(next)
  }
  useEffect(() => {
    if (!disabled && !loading && !error)
      rememberNavigation({ monitor: selected ?? null })
  }, [selected, disabled, loading, error])

  return (
    <div className="flex flex-col gap-4">
      {choices.length > 0 && (
        <Tabs
          value={selected?.id ?? ''}
          onValueChange={(id) => {
            setSelection(choices.find((choice) => choice.id === id) ?? null)
            setDisconnectedNotice(false)
          }}
        >
          <TabsList
            className="h-auto w-full min-w-0 max-w-full justify-start overflow-x-auto"
            aria-label="Monitores"
          >
            {monitors.map((monitor, index) => (
              <TabsTrigger
                key={monitor.id}
                value={monitor.id}
                title={`${monitor.name} · ${monitor.deviceName}`}
              >
                Monitor {index + 1} · {monitor.width}×{monitor.height}
                {monitor.primary ? ' · Principal' : ''}
                {monitor.id === 'studio-demo' ? ' · Demonstração' : ''}
              </TabsTrigger>
            ))}
            {disconnected.map((id, index) => (
              <TabsTrigger key={id} value={id} title={id}>
                Salvo {index + 1} · Desconectado
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      {disconnectedNotice && (
        <Alert role="status">
          <AlertDescription>
            O monitor selecionado foi desconectado. Suas configurações foram
            preservadas.
          </AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert>
          <AlertDescription>
            {error}
            <Button variant="outline" onClick={() => void refresh()}>
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {selected ? (
        <MonitorLayoutEditor
          key={selected.id}
          draft={source}
          onChange={commit}
          disabled={disabled}
          editor={editMonitorDraft(source, selected.id)}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyDescription>
              {loading
                ? 'Consultando monitores…'
                : 'Nenhum monitor disponível para editar.'}
            </EmptyDescription>
          </EmptyHeader>
          {!loading && (
            <Button variant="outline" onClick={() => void refresh()}>
              Atualizar monitores
            </Button>
          )}
        </Empty>
      )}
    </div>
  )
}

function MonitorLayoutEditor({
  draft: source,
  onChange: commit,
  disabled,
  editor
}: LayoutEditorProps & { editor: MonitorDraft }) {
  const draft = editor.view
  const editorRef = useRef<HTMLDivElement>(null)
  const pendingMoveFocus = useRef<ColumnMoveFocus | null>(null)
  useLayoutEffect(() => {
    const request = pendingMoveFocus.current
    if (
      !request ||
      findWidget(draft, request.widgetId)?.section !== request.target
    )
      return
    const buttons = Array.from(
      editorRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[data-column-move]'
      ) ?? []
    ).filter(
      (button) =>
        button.dataset.columnWidget === request.widgetId && !button.disabled
    )
    const target =
      buttons.find(
        (button) => button.dataset.columnMove === request.direction
      ) ?? buttons[0]
    target?.focus()
    pendingMoveFocus.current = null
  }, [draft])
  const layoutId = useId()
  const [drag, setDrag] = useState<MonitorLayoutMove | null>(null)
  const display = drag?.view ?? draft
  const activeWidget = drag?.widget
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function onDragEnd(event: DragEndEvent) {
    setDrag(null)
    const next = drag?.drop(
      editor,
      event.over ? String(event.over.id) : null,
      event.activatorEvent instanceof KeyboardEvent ? 'keyboard' : 'pointer'
    )
    if (next) commit(next)
  }

  function previewMove(event: DragMoveEvent) {
    const { over, activatorEvent, delta } = event
    if (!over || !(activatorEvent instanceof MouseEvent)) return
    const pointerY = activatorEvent.clientY + delta.y
    setDrag(
      (current) =>
        current?.preview(
          String(over.id),
          pointerY > over.rect.top + over.rect.height / 2
        ) ?? null
    )
  }

  return (
    <ManagerContext.Provider
      value={{
        config: source,
        editor,
        onChange: commit,
        requestMoveFocus: (move) => {
          pendingMoveFocus.current = move
        }
      }}
    >
      <div ref={editorRef} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <label htmlFor={layoutId}>Habilitar neste monitor</label>
          <Switch
            id={layoutId}
            disabled={disabled}
            checked={editor.enabled}
            onCheckedChange={(enabled) => commit(editor.setEnabled(enabled))}
          />
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={layoutCollision}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={({ active }) => {
            setDrag(editor.beginMove(String(active.id)))
          }}
          onDragCancel={() => setDrag(null)}
          onDragOver={previewMove}
          onDragMove={previewMove}
          onDragEnd={onDragEnd}
        >
          <MotionConfig
            reducedMotion={draft.bar.reduceMotion ? 'always' : 'never'}
          >
            <LayoutGroup id={layoutId}>
              <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="grid min-w-0 gap-4 md:grid-cols-3">
                  {sections.map((section) => (
                    <SectionColumn
                      key={section}
                      section={section}
                      widgets={display.widgets[section]}
                      draft={display}
                      disabled={disabled}
                    />
                  ))}
                </div>
                <WidgetCatalog
                  config={source}
                  display={draft}
                  disabled={disabled}
                  onAdd={(type, section) =>
                    commit(
                      editor.add(type, {
                        section,
                        index: draft.widgets[section].length
                      })
                    )
                  }
                />
              </div>
            </LayoutGroup>
          </MotionConfig>
          {createPortal(
            <DragOverlay adjustScale={false} dropAnimation={null}>
              {activeWidget && (
                <div
                  role="img"
                  aria-label={`Movendo ${typeLabels[activeWidget.type]}`}
                  className="rounded-md bg-card/60 glass-surface shadow-lg"
                >
                  <WidgetCard widget={activeWidget} draft={display} disabled />
                </div>
              )}
            </DragOverlay>,
            document.body
          )}
        </DndContext>
      </div>
    </ManagerContext.Provider>
  )
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

interface SectionColumnProps extends Pick<
  LayoutEditorProps,
  'draft' | 'disabled'
> {
  section: Section
  widgets: WidgetConfig[]
}

function SectionColumn({
  section,
  widgets,
  draft,
  disabled
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
    </Card>
  )
}

interface SortableWidgetProps extends Pick<
  LayoutEditorProps,
  'draft' | 'disabled'
> {
  widget: WidgetConfig
}

function SortableWidget({ widget, draft, disabled }: SortableWidgetProps) {
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
          disabled={disabled}
          dragHandleProps={{ ...attributes, ...listeners }}
        />
      </motion.div>
    </li>
  )
}

function WidgetCard({
  widget,
  draft,
  disabled,
  dragHandleProps
}: SortableWidgetProps & {
  dragHandleProps?: ComponentProps<typeof Button>
}) {
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const manager = useContext(ManagerContext)!
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
          onClick={() => manager.onChange(manager.editor.remove(widget.id))}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </ItemHeader>
      <ItemContent className="min-w-0 basis-full">
        <WidgetPreview
          widget={widget}
          theme={draft.bar.theme}
          colorTheme={draft.bar.colorTheme}
          separatorMarginX={draft.bar.separatorMarginX}
        />
      </ItemContent>
      <ItemFooter className="flex-wrap">
        <Popover open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <PopoverTrigger asChild>
            <Button
              disabled={disabled}
              variant="outline"
              size="icon"
              aria-label={`Configurar ${typeLabels[widget.type]}`}
            >
              <Settings />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            side="right"
            collisionPadding={16}
            aria-label={`Configurar ${typeLabels[widget.type]}`}
            className="w-[min(24rem,calc(100vw-2rem))] max-w-none max-h-[min(36rem,var(--radix-popover-content-available-height))] overflow-y-auto overscroll-contain"
          >
            <fieldset disabled={disabled}>
              <MonitorWidgetInspector
                widget={widget}
                draft={manager.config}
                onChange={manager.onChange}
                editor={manager.editor}
              />
            </fieldset>
            <Button className="mt-4" onClick={() => setInspectorOpen(false)}>
              Concluir
            </Button>
          </PopoverContent>
        </Popover>
        <div
          className="flex items-center gap-1"
          role="group"
          aria-label={`Mover ${typeLabels[widget.type]} entre colunas`}
        >
          {(
            [
              {
                direction: 'left',
                offset: -1,
                Icon: ChevronLeft,
                edge: 'esquerda'
              },
              {
                direction: 'right',
                offset: 1,
                Icon: ChevronRight,
                edge: 'direita'
              }
            ] as const
          ).map(({ direction, offset, Icon, edge }) => {
            const current = findWidget(draft, widget.id)?.section
            const target = current
              ? sections[sections.indexOf(current) + offset]
              : undefined
            const label = target
              ? `Mover ${typeLabels[widget.type]} para ${sectionLabels[target]}`
              : `Mover ${typeLabels[widget.type]} para a ${edge}`
            return (
              <Button
                key={direction}
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={disabled || !target}
                aria-label={label}
                title={
                  target
                    ? label
                    : `Já está na coluna ${current ? sectionLabels[current] : edge}`
                }
                data-column-widget={widget.id}
                data-column-move={direction}
                onClick={() => {
                  if (!target) return
                  manager.requestMoveFocus({
                    widgetId: widget.id,
                    direction,
                    target
                  })
                  manager.onChange(
                    manager.editor.move(widget.id, {
                      section: target,
                      index: draft.widgets[target].length
                    })
                  )
                }}
              >
                <Icon aria-hidden="true" />
              </Button>
            )
          })}
        </div>
      </ItemFooter>
    </Item>
  )
}
