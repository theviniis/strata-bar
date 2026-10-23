import { AgentsController } from '../../features/agents/AgentsController'
import { ClockController } from '../../features/clock/ClockController'
import { CpuController } from '../../features/cpu/CpuController'
import { DiskController } from '../../features/disk/DiskController'
import { GpuController } from '../../features/gpu/GpuController'
import { KomorebiController } from '../../features/komorebi/KomorebiController'
import { MemoryController } from '../../features/memory/MemoryController'
import { MicrophoneController } from '../../features/microphone/MicrophoneController'
import { MusicController } from '../../features/music/MusicController'
import { RemindersController } from '../../features/reminders/RemindersController'
import { VolumeController } from '../../features/volume/VolumeController'
import type { ReactElement } from 'react'
import type { WidgetConfig } from '../../services/configuration/config'
import { defaultView, viewOf, type WidgetView } from './presentation'
import { WidgetViewContext } from './widget-view'
import { Unsupported } from './Unsupported'

/**
 * One configured widget of the native bar. The composition (presence, order,
 * section) is owned by `NativeBar`; this module owns the widget-to-component
 * mapping and provides each widget its configured presentation.
 *
 * The mapping is a table so the supported set is one readable list and an
 * unknown type is a compile error.
 */
const widgets: Record<WidgetConfig['type'], () => ReactElement> = {
  clock: () => <ClockController />,
  reminders: () => <RemindersController />,
  agents: () => <AgentsController />,
  cpu: () => <CpuController />,
  memory: () => <MemoryController />,
  gpu: () => <GpuController />,
  disk: () => <DiskController />,
  music: () => <MusicController />,
  volume: () => <VolumeController />,
  microphone: () => <MicrophoneController />,
  komorebi: () => <KomorebiController />,
  // No native collector is wired for these yet; the bar renders an honest
  // placeholder instead of inventing a reading.
  network: () => <Unsupported label="Rede" />,
  activeWindow: () => <Unsupported label="Janela ativa" />
}

export function Widget({ widget }: { widget: WidgetConfig }) {
  const view: WidgetView = widget ? viewOf(widget) : defaultView
  return (
    <WidgetViewContext.Provider value={view}>
      {widgets[widget.type]()}
    </WidgetViewContext.Provider>
  )
}
