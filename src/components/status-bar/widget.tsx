import { WeatherController } from '@/features/weather/widget/weather.controller'
import { MediaSpectrumController } from '@/features/media-spectrum/widget/media-spectrum.controller'
import { AgentsController } from '../../features/agents/widget/agents.controller'
import { ClockController } from '../../features/clock/widget/clock.controller'
import { CpuController } from '../../features/cpu/widget/cpu.controller'
import { DiskController } from '../../features/disk/widget/disk.controller'
import { GpuController } from '../../features/gpu/widget/gpu.controller'
import { WorkspacesController } from '../../features/workspaces/widget/workspaces.controller'
import { MemoryController } from '../../features/memory/widget/memory.controller'
import { MicrophoneController } from '../../features/microphone/widget/microphone.controller'
import { MusicController } from '../../features/music/widget/music.controller'
import { RemindersController } from '../../features/reminders/widget/reminders.controller'
import { VolumeController } from '../../features/volume/widget/volume.controller'
import type { ReactElement } from 'react'
import type { WidgetConfig } from '../../services/configuration/config'
import { defaultView, viewOf, type WidgetView } from './presentation'
import { WidgetViewContext } from './widget-view'
import { Unsupported } from './unsupported'
import { BarVerticalSeparator } from '../ui/bar-vertical-separator'
import { useSeparatorMargin } from './separator-margin'
import { isWidgetAvailable } from '@/services/configuration/widget-flags'

/**
 * One configured widget of the native bar. The composition (presence, order,
 * section) is owned by `NativeBar`; this module owns the widget-to-component
 * mapping and provides each widget its configured presentation.
 *
 * The mapping is a table so the supported set is one readable list and an
 * unknown type is a compile error.
 */
const widgets: Record<
  Exclude<WidgetConfig['type'], 'separator'>,
  () => ReactElement
> = {
  clock: () => <ClockController />,
  weather: () => <WeatherController />,
  reminders: () => <RemindersController />,
  agents: () => <AgentsController />,
  cpu: () => <CpuController />,
  memory: () => <MemoryController />,
  gpu: () => <GpuController />,
  disk: () => <DiskController />,
  music: () => <MusicController />,
  mediaSpectrum: () => <MediaSpectrumController />,
  volume: () => <VolumeController />,
  microphone: () => <MicrophoneController />,
  workspaces: () => <WorkspacesController />,
  // No native collector is wired for these yet; the bar renders an honest
  // placeholder instead of inventing a reading.
  network: () => <Unsupported label="Rede" />,
  activeWindow: () => <Unsupported label="Janela ativa" />
}

export function Widget({ widget }: { widget: WidgetConfig }) {
  const separatorMargin = useSeparatorMargin()
  if (!isWidgetAvailable(widget.type)) return null
  if (widget.type === 'separator')
    return <BarVerticalSeparator marginX={separatorMargin} />
  const view: WidgetView = widget ? viewOf(widget) : defaultView
  return (
    <WidgetViewContext.Provider value={view}>
      {widgets[widget.type]()}
    </WidgetViewContext.Provider>
  )
}
