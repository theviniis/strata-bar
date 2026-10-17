import { useEffect, useState } from 'react'
import { create } from 'zustand'
import {
  Cpu,
  MemoryStick,
  CircuitBoard,
  ArrowDownUp,
  Volume2,
  AppWindow,
  Clock3
} from 'lucide-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { bridge, connect } from '../../services/system/bridge'
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover'
const useMetrics = create(() => ({}))
const registry = {
  cpu: { icon: Cpu, label: 'CPU', format: (v) => `${v}%` },
  memory: { icon: MemoryStick, label: 'RAM', format: (v) => `${v}%` },
  gpu: { icon: CircuitBoard, label: 'GPU', format: (v) => `${v}%` },
  network: { icon: ArrowDownUp, label: 'NET', format: (v) => `${v} KB/s` },
  volume: { icon: Volume2, label: 'Audio', format: (v) => `${v}%` },
  activeWindow: { icon: AppWindow, label: 'Active window', format: (v) => v },
  clock: { icon: Clock3, label: 'Local time' }
}
function Clock({ format }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    let timer
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
        <small>
          {now.toLocaleDateString([], { month: 'short', day: 'numeric' })}
        </small>
      )}
    </span>
  )
}
export function Widget({ widget }) {
  const sample = useMetrics((s) => s[widget.id])
  useEffect(() => {
    if (widget.type === 'clock') return
    return connect(
      bridge,
      widget.type,
      { intervalMs: widget.intervalMs },
      (value) => useMetrics.setState({ [widget.id]: value }),
      (error) =>
        useMetrics.setState({
          [widget.id]: { status: 'error', error: String(error) }
        })
    )
  }, [widget.id, widget.type, widget.intervalMs])
  const def = registry[widget.type],
    Icon = def.icon
  const text =
    widget.type === 'clock'
      ? null
      : !sample
        ? 'Loading…'
        : sample.status === 'ready'
          ? def.format(sample.data)
          : sample.status === 'error'
            ? 'Error'
            : 'Unavailable'
  return (
    <Tooltip.Root>
      <Popover>
        <Tooltip.Trigger asChild>
          <PopoverTrigger
            className={`widget ${widget.type}`}
            aria-label={def.label}
          >
            <Icon size={14} />
            {widget.format === 'label' &&
              !['clock', 'activeWindow', 'volume'].includes(widget.type) && (
                <small>{def.label}</small>
              )}
            {widget.type === 'clock' ? (
              <Clock format={widget.format} />
            ) : (
              <span>{text}</span>
            )}
          </PopoverTrigger>
        </Tooltip.Trigger>
        <PopoverContent>
          <strong>{def.label}</strong>
          <p>
            {sample?.error ||
              (bridge.mode === 'demo'
                ? 'Preview data · no system access'
                : `Status: ${sample?.status || 'loading'}`)}
          </p>
          {widget.type === 'volume' && (
            <p>Volume control awaits Core Audio integration.</p>
          )}
        </PopoverContent>
      </Popover>
      {widget.tooltip && (
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip" sideOffset={6}>
            {def.label} · {bridge.mode}
          </Tooltip.Content>
        </Tooltip.Portal>
      )}
    </Tooltip.Root>
  )
}
