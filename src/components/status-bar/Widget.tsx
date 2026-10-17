import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  Cpu,
  MemoryStick,
  CircuitBoard,
  ArrowDownUp,
  Volume2,
  AppWindow,
  Clock3,
  type LucideIcon
} from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  bridge,
  connect,
  type Channel,
  type DemoBridge,
  type DemoChannelData,
  type SystemEvent
} from '../../services/system/bridge'
import type {
  WidgetConfig,
  WidgetType
} from '../../services/configuration/config'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'

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
  network: { icon: ArrowDownUp, label: 'NET' },
  volume: { icon: Volume2, label: 'Audio' },
  activeWindow: { icon: AppWindow, label: 'Active window' },
  clock: { icon: Clock3, label: 'Local time' }
}

const formatters: Record<Channel, (value: PreviewValue) => string> = {
  cpu: (v) => `${v}%`,
  memory: (v) => `${v}%`,
  gpu: (v) => `${v}%`,
  network: (v) => `${v} KB/s`,
  volume: (v) => `${v}%`,
  activeWindow: (v) => String(v)
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
        <small className="ml-[10px] text-[9px] text-[#a19cab] group-data-[theme=light]:text-[#746b80]">
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
    if (type === 'clock') return
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
  return (
    <Tooltip.Root>
      <Popover>
        <Tooltip.Trigger asChild>
          <PopoverTrigger
            className="flex min-w-0 cursor-pointer touch-manipulation items-center gap-[6px] rounded-[4px] border-0 bg-transparent p-[4px] text-[10px] whitespace-nowrap text-inherit hover:bg-[#ffffff0d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b7a1ff]"
            aria-label={def.label}
          >
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
          </PopoverTrigger>
        </Tooltip.Trigger>
        <PopoverContent>
          <strong>{def.label}</strong>
          <p className="text-[13px] leading-[1.8] text-[#92929f]">
            {(sample?.status === 'error' ? sample.error : '') ||
              (bridge.mode === 'demo'
                ? 'Preview data · no system access'
                : `Status: ${sample?.status || 'loading'}`)}
          </p>
          {widget.type === 'volume' && (
            <p className="text-[13px] leading-[1.8] text-[#92929f]">
              Volume control awaits Core Audio integration.
            </p>
          )}
        </PopoverContent>
      </Popover>
      {widget.tooltip && (
        <Tooltip.Portal>
          <Tooltip.Content
            className="z-50 rounded-[8px] border border-[#494052] bg-[#211e2b] px-[10px] py-[7px] text-[10px] text-[#e9e1f7] shadow-[0_8px_28px_#0005]"
            sideOffset={6}
          >
            {def.label} · {bridge.mode}
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  )
}
