import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { ScrollingText } from '@/components/ui/scrolling-text'
import { WidgetItemTooltip } from '@/components/widget-item'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import { useSystemChannel } from '@/hooks/use-system-channel'
import { WidgetPopup } from '@/popups/widget-popup'
import { bridge, type SystemEvent } from '@/services/system/bridge'
import type { MediaData, MediaRequest } from '@/services/system/media.generated'
import { useState } from 'react'
import { useMusicInteractions } from '../src/use-music-interactions'
import { Music } from './music.widget'
export function MusicController() {
  const view = useWidgetView()
  const event = useSystemChannel('media', 0, view.intervalMs)
  return (
    <MusicContent
      event={event}
      tooltip={view.tooltip}
      onAction={async (request) => {
        if (!bridge.mediaAction)
          throw new Error('Controles de mídia indisponíveis')
        await bridge.mediaAction(request)
      }}
    />
  )
}

export function MusicContent({
  event,
  onAction,
  demo = false,
  tooltip = true
}: {
  event: SystemEvent<MediaData>
  onAction(request: MediaRequest): Promise<unknown>
  demo?: boolean
  /** The widget's configured tooltip toggle. */
  tooltip?: boolean
}) {
  const preview = useWidgetPreview()
  const current = event.status === 'ready' ? event.data : null
  const { state, interactions } = useMusicInteractions(current, onAction)
  const pending = state.pending.playback
  const error = state.error
  const [badArt, setBadArt] = useState<string | null>(null)
  const text = current
    ? `${current.title || 'Sem título'}${current.artist ? ` — ${current.artist}` : ''}`
    : event.status === 'loading'
      ? 'Carregando mídia…'
      : event.status === 'error'
        ? 'Mídia indisponível'
        : 'Nenhuma música tocando'
  const artwork =
    current?.artwork.status === 'ready' ? current.artwork.value : null
  const tooltipText = `${demo ? 'Demonstração · ' : ''}${text}${error ? ` · ${error}` : ''}`
  const tip = useOverlayTooltip(tooltip ? tooltipText : '')
  return (
    <WidgetPopup.Root popup="music">
      <WidgetPopup.Anchor asChild>
        <Music
          current={current}
          pending={pending}
          demo={demo}
          artwork={artwork === badArt ? null : artwork}
          onArtworkError={() => setBadArt(artwork)}
          onAction={(action) => {
            void interactions.dispatch(action)
          }}
          tooltipTrigger={tip.trigger}
        >
          <WidgetPopup.Trigger asChild>
            <button
              aria-label="Abrir player de música"
              className="relative z-10 flex min-w-0 flex-1 cursor-pointer items-center self-stretch outline-none data-[popup-open=true]:bg-transparent"
            >
              <ScrollingText
                text={text}
                animate={!preview}
                aria-describedby={tooltip ? tip.describedBy : undefined}
                className="relative z-10 mx-1 flex-1 text-bar"
              />
            </button>
          </WidgetPopup.Trigger>
        </Music>
      </WidgetPopup.Anchor>
      {tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>
          {tooltipText}
        </WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
