import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { bridge } from '@/services/system/bridge'
import { MediaSpectrum } from './media-spectrum.widget'

export function MediaSpectrumController() {
  const event = useSystemChannel('mediaSpectrum')
  const runtime = useWidgetRuntime()
  return (
    <MediaSpectrum
      data={event.status === 'ready' ? event.data : null}
      demo={!runtime.interactive || bridge.mode === 'demo'}
    />
  )
}
