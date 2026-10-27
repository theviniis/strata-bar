import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { bridge } from '@/services/system/bridge'
import { MediaSpectrum } from './media-spectrum.widget'

export function MediaSpectrumController() {
  const event = useSystemChannel('mediaSpectrum')
  const preview = useWidgetPreview()
  return (
    <MediaSpectrum
      data={event.status === 'ready' ? event.data : null}
      demo={preview || bridge.mode === 'demo'}
    />
  )
}
