import { DemoMusic } from '../../features/music/Music'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import {
  AppWindow,
  ArrowDownUp,
  CircuitBoard,
  Clock3,
  Cpu,
  HardDrive,
  LayoutGrid,
  MemoryStick,
  Music2,
  Volume2,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { DiskBar } from '../../features/disk/Disk'
import { localVolumes } from '../../features/disk/presentation'
import { Workspaces } from '../../features/komorebi/Workspaces'
import type {
  WidgetConfig,
  WidgetType
} from '../../services/configuration/config'
import {
  bridge,
  connect,
  type Channel,
  type DemoBridge,
  type DemoChannelData,
  type KomorebiData,
  type SystemEvent
} from '../../services/system/bridge'
import type { DiskData } from '../../services/system/disk.generated'
import { WidgetPopup } from '../../popups/WidgetPopup'
import type { PopupId } from '../../popups/resolve'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'

type PreviewValue = DemoChannelData[Channel]
type PreviewSnapshot = SystemEvent<PreviewValue>

const useMetrics = create<Record<string, PreviewSnapshot | undefined>>(
  () => ({})
)

// The studio is always served by the demo adapter, whose payloads are scalars.
const preview = bridge as DemoBridge

const meta: Record<WidgetType, { icon: LucideIcon; label: string }> = {
  cpu: { icon: Cpu, label: 'CPU' },
  memory: { icon: MemoryStick, label: 'RAM' },
  gpu: { icon: CircuitBoard, label: 'GPU' },
  disk: { icon: HardDrive, label: 'HD' },
  network: { icon: ArrowDownUp, label: 'NET' },
  music: { icon: Music2, label: 'Música' },
  volume: { icon: Volume2, label: 'Audio' },
  activeWindow: { icon: AppWindow, label: 'Active window' },
  komorebi: { icon: LayoutGrid, label: 'Workspaces' },
  clock: { icon: Clock3, label: 'Local time' }
}

const formatters: Record<Channel, (value: PreviewValue) => string> = {
  cpu: (v) => `${v}%`,
  memory: (v) => `${v}%`,
  gpu: (v) => `${v}%`,
  disk: () => '',
  network: (v) => `${v} KB/s`,
  volume: (v) => `${v}%`,
  activeWindow: (v) => String(v),
  komorebi: () => '',
  media: () => '',
  audioOutputs: () => ''
}

function Clock({ format }: { format: WidgetConfig['format'] }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      setNow(new Date())
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    tick()
    return () => clearTimeout(timer)
  }, [])
  return (
    <span>
      {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      {format === 'label' && (
        <small className="ml-2.5 text-[9px] text-[#a19cab] group-data-[theme=light]:text-[#746b80]">
          {now.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </small>
      )}
    </span>
  )
}

export function Widget({ widget }: { widget: WidgetConfig }) {
  const sample = useMetrics((s) => s[widget.id])
  useEffect(() => {
    const type = widget.type
    if (type === 'clock' || type === 'music') return
    return connect<DemoChannelData, Channel>(
      preview,
      type,
      { intervalMs: widget.intervalMs },
      (value) => useMetrics.setState({ [widget.id]: value }),
      (error) =>
        useMetrics.setState({
          [widget.id]: { status: 'error', data: null, error: String(error) }
        })
    )
  }, [widget.id, widget.type, widget.intervalMs])
  if (widget.type === 'music') return <DemoMusic />
  if (widget.type === 'komorebi') {
    // The workspace strip is a row of controls, so it cannot nest inside the
    // popover trigger button; it renders as its own compact widget instead.
    const snapshot =
      sample?.status === 'ready' ? (sample.data as KomorebiData) : null
    return (
      <div
        className="flex min-w-0 items-center gap-1.5 rounded-sm p-1 text-[10px] whitespace-nowrap text-inherit"
        aria-label={meta.komorebi.label}
        title="Preview do komorebi · a barra nativa foca a área clicada"
      >
        <LayoutGrid
          size={14}
          className="shrink-0 text-[#b5a4d9] group-data-[theme=light]:text-[#78668d]"
        />
        {widget.format === 'label' && (
          <small className="text-[9px] text-[#a19cab] group-data-[theme=light]:text-[#746b80]">
            {meta.komorebi.label}
          </small>
        )}
        <Workspaces
          workspaces={snapshot?.workspaces ?? []}
          offline={
            sample?.status === 'unavailable' || sample?.status === 'error'
          }
          onSelect={(workspace) =>
            bridge
              .komorebiAction?.({
                action: 'focusWorkspace',
                monitor: snapshot?.monitor ?? 0,
                workspace
              })
              .catch((e) =>
                console.error('Falha ao focar a área de trabalho', e)
              )
          }
        />
      </div>
    )
  }
  const def = meta[widget.type],
    Icon = def.icon
  const type = widget.type
  const text =
    type === 'clock'
      ? null
      : !sample
        ? 'Loading…'
        : sample.status === 'ready'
          ? formatters[type](sample.data)
          : sample.status === 'error'
            ? 'Error'
            : 'Unavailable'
  if (
    widget.type === 'volume' ||
    widget.type === 'memory' ||
    widget.type === 'cpu' ||
    widget.type === 'gpu' ||
    widget.type === 'disk'
  ) {
    const popups: Partial<Record<WidgetType, { id: PopupId; label: string }>> =
      {
        cpu: { id: 'cpu', label: 'Detalhes da CPU' },
        gpu: { id: 'gpu', label: 'Detalhes da GPU' },
        memory: { id: 'memory', label: 'Detalhes da memória' },
        volume: { id: 'audioOutputs', label: 'Saída de áudio' },
        disk: { id: 'disk', label: 'Detalhes dos discos' }
      }
    const popup = popups[widget.type]
    if (!popup) return null
    return (
      <WidgetPopup.Root popup={popup.id}>
        <WidgetPopup.Anchor asChild>
          <span className="inline-flex">
            <WidgetPopup.Trigger asChild>
              <button
                aria-label={popup.label}
                className="flex items-center gap-1.5 rounded-sm p-1"
              >
                {widget.type === 'disk' ? (
                  <DiskBar
                    volumes={localVolumes(
                      sample?.status === 'ready'
                        ? (sample.data as DiskData).volumes
                        : []
                    )}
                  />
                ) : (
                  <>
                    <Icon size={14} />
                    <span>{text}</span>
                  </>
                )}
              </button>
            </WidgetPopup.Trigger>
          </span>
        </WidgetPopup.Anchor>
      </WidgetPopup.Root>
    )
  }
  return (
    <Tooltip>
      <Popover>
        <TooltipTrigger render={<PopoverTrigger aria-label={def.label} />}>
          <Icon
            size={14}
            className="shrink-0 text-[#b5a4d9] group-data-[theme=light]:text-[#78668d]"
          />
          {widget.format === 'label' &&
            !['clock', 'activeWindow', 'volume'].includes(widget.type) && (
              <small className="text-[9px] text-[#a19cab] group-data-[theme=light]:text-[#746b80]">
                {def.label}
              </small>
            )}
          {widget.type === 'clock' ? (
            <Clock format={widget.format} />
          ) : (
            <span className="overflow-hidden text-ellipsis">{text}</span>
          )}
        </TooltipTrigger>
        <PopoverContent>
          <strong>{def.label}</strong>
          <p className="text-[13px] leading-[1.8] text-[#92929f]">
            {(sample?.status === 'error' ? sample.error : '') ||
              (bridge.mode === 'demo'
                ? 'Preview data · no system access'
                : `Status: ${sample?.status || 'loading'}`)}
          </p>
        </PopoverContent>
      </Popover>
      {widget.tooltip && (
        <TooltipContent>
          {def.label} · {bridge.mode}
        </TooltipContent>
      )}
    </Tooltip>
  )
}
