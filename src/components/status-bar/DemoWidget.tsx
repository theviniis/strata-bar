import { WidgetViewContext } from './widget-view'
import { WidgetPreviewContext } from './widget-preview-context'
import { DemoVolumeController } from '@/features/volume/VolumeController'
import { DemoMicrophoneController } from '@/features/microphone/MicrophoneController'
import { DemoKomorebiController } from '@/features/komorebi/KomorebiController'
import { DemoDiskController } from '@/features/disk/DiskController'
import { DemoClockController } from '@/features/clock/ClockController'
import { DemoGpuController } from '@/features/gpu/GpuController'
import { DemoMemoryController } from '@/features/memory/MemoryController'
import { DemoCpuController } from '@/features/cpu/CpuController'
import { viewOf } from './presentation'
import { DemoMusicController } from '../../features/music/MusicController'
import { AgentsController } from '../../features/agents/AgentsController'
import { RemindersController } from '../../features/reminders/RemindersController'
import { useEffect, useMemo } from 'react'
import { create } from 'zustand'
import type { WidgetConfig } from '../../services/configuration/config'
import {
  bridge,
  demoChannelData,
  connect,
  type Channel,
  type DemoBridge,
  type DemoChannelData,
  type KomorebiData,
  type SystemEvent
} from '../../services/system/bridge'
import type { DiskData } from '../../services/system/disk.generated'
import { Unsupported } from './Unsupported'
import { BarVerticalSeparator } from '../ui/bar-vertical-separator'
import { useSeparatorMargin } from './separator-margin'
import { isWidgetAvailable } from '@/services/configuration/widget-flags'

type PreviewValue = DemoChannelData[Channel]
type PreviewSnapshot = SystemEvent<PreviewValue>

const useMetrics = create<Record<string, PreviewSnapshot | undefined>>(
  () => ({})
)

// The studio is always served by the demo adapter, whose payloads are scalars.
const preview = bridge as DemoBridge

/**
 * The browser studio's preview widget: it reads only the demo adapter's scalar
 * payloads. The native bar renders the real feature widgets instead (`Widget`),
 * so a preview-only path never leaks into the Windows runtime.
 */
type DemoWidgetProps = { widget: WidgetConfig; staticPreview?: boolean }
export function DemoWidget({ widget, staticPreview = false }: DemoWidgetProps) {
  const separatorMargin = useSeparatorMargin()
  if (!isWidgetAvailable(widget.type)) return null
  if (widget.type === 'separator')
    return <BarVerticalSeparator marginX={separatorMargin} />
  return (
    <WidgetViewContext value={viewOf(widget)}>
      <WidgetPreviewContext value={staticPreview}>
        <DemoWidgetController widget={widget} staticPreview={staticPreview} />
      </WidgetPreviewContext>
    </WidgetViewContext>
  )
}
function DemoWidgetController({
  widget,
  staticPreview = false
}: DemoWidgetProps) {
  const liveSample = useMetrics((s) => s[widget.id])
  const staticValues = useMemo(
    () => (staticPreview ? demoChannelData() : null),
    [staticPreview]
  )
  const previewType = widget.type
  const sample: PreviewSnapshot | undefined = staticPreview
    ? previewType === 'separator' ||
      previewType === 'clock' ||
      previewType === 'music' ||
      previewType === 'agents' ||
      previewType === 'reminders'
      ? undefined
      : { status: 'ready', data: staticValues![previewType] }
    : liveSample
  useEffect(() => {
    if (staticPreview) return
    const type = widget.type
    if (
      type === 'separator' ||
      type === 'clock' ||
      type === 'music' ||
      type === 'reminders' ||
      type === 'agents' ||
      type === 'network' ||
      type === 'activeWindow'
    )
      return
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
  }, [widget.id, widget.type, widget.intervalMs, staticPreview])
  if (
    widget.type === 'cpu' ||
    widget.type === 'memory' ||
    widget.type === 'gpu'
  ) {
    const Controller =
      widget.type === 'cpu'
        ? DemoCpuController
        : widget.type === 'memory'
          ? DemoMemoryController
          : DemoGpuController
    return (
      <Controller
        event={
          sample?.status === 'ready' && typeof sample.data === 'number'
            ? { status: 'ready', data: sample.data }
            : sample?.status === 'error'
              ? { status: 'error', error: sample.error }
              : sample?.status === 'unavailable'
                ? { status: 'unavailable', data: null }
                : { status: 'loading' }
        }
        view={viewOf(widget)}
      />
    )
  }
  if (widget.type === 'clock')
    return (
      <DemoClockController
        view={viewOf(widget)}
        staticPreview={staticPreview}
      />
    )
  if (widget.type === 'disk')
    return (
      <DemoDiskController
        event={
          sample?.status === 'ready'
            ? { status: 'ready', data: sample.data as DiskData }
            : sample?.status === 'error'
              ? { status: 'error', error: sample.error }
              : sample?.status === 'unavailable'
                ? { status: 'unavailable', data: null }
                : { status: 'loading' }
        }
        view={viewOf(widget)}
      />
    )
  if (widget.type === 'music')
    return (
      <DemoMusicController
        view={viewOf(widget)}
        staticPreview={staticPreview}
      />
    )
  if (widget.type === 'reminders') return <RemindersController />
  if (widget.type === 'agents') return <AgentsController />
  if (widget.type === 'volume' || widget.type === 'microphone') {
    const Controller =
      widget.type === 'volume' ? DemoVolumeController : DemoMicrophoneController
    return (
      <Controller
        view={viewOf(widget)}
        event={
          sample?.status === 'ready' && typeof sample.data === 'number'
            ? { status: 'ready', data: sample.data }
            : sample?.status === 'error'
              ? { status: 'error', error: sample.error }
              : sample?.status === 'unavailable'
                ? { status: 'unavailable', data: null }
                : { status: 'loading' }
        }
      />
    )
  }
  if (widget.type === 'komorebi')
    return (
      <DemoKomorebiController
        event={
          sample?.status === 'ready'
            ? { status: 'ready', data: sample.data as KomorebiData }
            : sample?.status === 'error'
              ? { status: 'error', error: sample.error }
              : sample?.status === 'unavailable'
                ? { status: 'unavailable', data: null }
                : { status: 'loading' }
        }
        view={viewOf(widget)}
        inert={staticPreview}
      />
    )
  return (
    <Unsupported label={widget.type === 'network' ? 'Rede' : 'Janela ativa'} />
  )
}
