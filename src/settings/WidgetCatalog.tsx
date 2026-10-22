import { useState } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { GripVertical, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card'
import { Empty, EmptyHeader, EmptyDescription } from '@/components/ui/empty'
import { WidgetPreview } from '@/components/status-bar/WidgetPreview'
import {
  types,
  widgetSchema,
  type Config,
  type WidgetType
} from '@/services/configuration/config'
import {
  allWidgets,
  sections,
  sectionLabels,
  typeLabels,
  type Section
} from './layout'

export function WidgetCatalog({
  config,
  display,
  disabled,
  onAdd
}: {
  config: Config
  display: Config
  disabled?: boolean
  onAdd(type: WidgetType, section: Section): void
}) {
  const [search, setSearch] = useState('')
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
  const existing = new Set(allWidgets(display).map((w) => w.type))
  const available = types.filter(
    (type) =>
      !existing.has(type) &&
      normalize(typeLabels[type]).includes(normalize(search))
  )
  return (
    <aside
      aria-label="Widgets disponíveis"
      className="min-w-0 xl:sticky xl:top-0 xl:self-start"
    >
      <Card>
        <CardHeader>
          <CardTitle>Widgets disponíveis</CardTitle>
          <CardDescription>
            Arraste uma prévia ou escolha onde adicionar.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
          <Field>
            <FieldLabel htmlFor="widget-search">Buscar widgets</FieldLabel>
            <Input
              id="widget-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar widgets…"
            />
          </Field>
          {available.map((type) => (
            <CatalogEntry
              key={type}
              type={type}
              config={config}
              disabled={disabled}
              onAdd={onAdd}
            />
          ))}
          {!available.length && (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>Nenhum widget disponível.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </aside>
  )
}
function CatalogEntry({
  type,
  config,
  disabled,
  onAdd
}: {
  type: WidgetType
  config: Config
  disabled?: boolean
  onAdd(type: WidgetType, section: Section): void
}) {
  const { setNodeRef, listeners, attributes } = useDraggable({
    id: `catalog:${type}`,
    disabled
  })
  const [open, setOpen] = useState(false)
  const widget =
    allWidgets(config).find((w) => w.type === type) ??
    widgetSchema.parse({ id: type, type })
  return (
    <div ref={setNodeRef} className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-xs"
          className="cursor-grab touch-none"
          disabled={disabled}
          aria-label={`Arrastar ${typeLabels[type]} do catálogo`}
          {...attributes}
          {...listeners}
        >
          <GripVertical />
        </Button>
        <span className="flex-1">{typeLabels[type]}</span>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon-xs"
              disabled={disabled}
              aria-label={`Adicionar ${typeLabels[type]}`}
            >
              <Plus />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="flex flex-col gap-2"
            aria-label={`Destino de ${typeLabels[type]}`}
          >
            {sections.map((section) => (
              <Button
                key={section}
                variant="ghost"
                aria-label={`Adicionar ${typeLabels[type]} em ${sectionLabels[section]}`}
                onClick={() => {
                  onAdd(type, section)
                  setOpen(false)
                }}
              >
                {sectionLabels[section]}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <WidgetPreview widget={widget} theme={config.bar.theme} />
    </div>
  )
}
