import { useSystemChannel } from '@/hooks/useSystemChannel'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { bridge } from '@/services/system/bridge'
import { MediaSpectrum } from './MediaSpectrum'

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
