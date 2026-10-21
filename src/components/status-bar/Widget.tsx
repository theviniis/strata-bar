import { Agents } from '../../features/agents/Agents'
import { Clock } from '../../features/clock/Clock'
import { Cpu } from '../../features/cpu/Cpu'
import { Disk } from '../../features/disk/Disk'
import { Gpu } from '../../features/gpu/Gpu'
import { Komorebi } from '../../features/komorebi/Komorebi'
import { Memory } from '../../features/memory/Memory'
import { Microphone } from '../../features/microphone/Microphone'
import { Music } from '../../features/music/Music'
import { Reminders } from '../../features/reminders/Reminders'
import { Volume } from '../../features/volume/Volume'
import type { ReactElement } from 'react'
import type { WidgetConfig } from '../../services/configuration/config'
import { defaultView, viewOf, type WidgetView } from './presentation'
import { WidgetViewContext } from './widget-view'

/**
 * One configured widget of the native bar. The composition (presence, order,
 * section) is owned by `NativeBar`; this module owns the widget-to-component
 * mapping and provides each widget its configured presentation.
 *
 * The mapping is a table so the supported set is one readable list and an
 * unknown type is a compile error.
 */
const widgets: Record<WidgetConfig['type'], () => ReactElement> = {
  clock: () => <Clock />,
  reminders: () => <Reminders />,
  agents: () => <Agents />,
  cpu: () => <Cpu />,
  memory: () => <Memory />,
  gpu: () => <Gpu />,
  disk: () => <Disk />,
  music: () => <Music />,
  volume: () => <Volume />,
  microphone: () => <Microphone />,
  komorebi: () => <Komorebi />,
  // No native collector is wired for these yet; the bar renders an honest
  // placeholder instead of inventing a reading.
  network: () => <Unsupported label="Rede" />,
  activeWindow: () => <Unsupported label="Janela ativa" />
}

function Unsupported({ label }: { label: string }) {
  return (
    <span
      className="px-1 text-[10px] text-muted-foreground"
      aria-label={`${label} indisponível`}
    >
      —
    </span>
  )
}

export function Widget({ widget }: { widget: WidgetConfig }) {
  const view: WidgetView = widget ? viewOf(widget) : defaultView
  return (
    <WidgetViewContext.Provider value={view}>
      {widgets[widget.type]()}
    </WidgetViewContext.Provider>
  )
}
