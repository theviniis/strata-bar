import type { WidgetView } from '@/components/status-bar/presentation'
import { WidgetItem, WidgetItemIcon } from '@/components/widget-item'
import { cn } from '@/lib/utils'
import type { MediaAction, MediaData } from '@/services/system/media.generated'
import type { ComponentProps, ReactNode } from 'react'
import { FaBackwardStep, FaForwardStep, FaPause, FaPlay } from 'react-icons/fa6'
export interface MusicProps extends ComponentProps<'div'> {
  marginX?: WidgetView['marginX']
  current: MediaData | null
  pending: boolean
  demo: boolean
  artwork: string | null
  onArtworkError(): void
  onAction(action: MediaAction): void
  tooltipTrigger: ComponentProps<'div'>
  children: ReactNode
}
export function Music({
  current,
  pending,
  demo,
  artwork,
  onArtworkError,
  onAction,
  tooltipTrigger,
  children,
  className,
  marginX: _marginX = 0,
  ...anchorProps
}: MusicProps) {
  return (
    <WidgetItem className="group/music p-0" disabled={!current} asChild>
      <div
        aria-label={demo ? 'Música · demonstração' : 'Música'}
        className={cn(
          'min-w-0 max-w-45 shrink overflow-hidden group-data-[has-previous=true]/bar-item:ml-2 group-data-[has-next=true]/bar-item:mr-2',
          className
        )}
        {...anchorProps}
      >
        <div
          className="relative isolate flex min-w-0 items-center overflow-hidden rounded bg-muted/40 mask-[linear-gradient(#000,#000)] text-foreground group-data-[theme=light]:bg-[#302a3e]/5"
          {...tooltipTrigger}
        >
          {artwork && (
            <div className="pointer-events-none absolute inset-0 z-0">
              <img
                src={artwork}
                alt=""
                onError={onArtworkError}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute inset-0 bg-black/80 group-data-[theme=light]:bg-[#f8f5f2]/50" />
              {/* The cover sits above the bar's shared hover highlight, so
                      the music widget mirrors that surface (and the popup-open
                      state) with its own layer. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded bg-muted opacity-0 transition-opacity duration-200 ease-out group-hover/music:opacity-100 group-data-[popup-open=true]/music:opacity-100 motion-reduce:transition-none"
              />
            </div>
          )}
          <MediaControls
            current={current}
            pending={pending}
            onClick={onAction}
          />
          {children}
        </div>
      </div>
    </WidgetItem>
  )
}
const mediaControlMap = (current: MediaData | null) =>
  [
    ['previous', 'Faixa anterior', FaBackwardStep],
    [
      'playPause',
      current?.playback === 'playing' ? 'Pausar' : 'Reproduzir',
      current?.playback === 'playing' ? FaPause : FaPlay
    ],
    ['next', 'Próxima faixa', FaForwardStep]
  ] as const

type NediaControlMapReturn = ReturnType<typeof mediaControlMap>[number][0]

interface MediaControlsProps {
  current: MediaData | null
  pending: boolean
  onClick: (data: { action: NediaControlMapReturn }) => void
}

function MediaControls({ current, pending, onClick }: MediaControlsProps) {
  return (
    <div className="flex items-center" aria-busy={pending}>
      {mediaControlMap(current).map(([action, label, Icon]) => (
        <button
          key={action}
          type="button"
          aria-label={label}
          // Not a WidgetItem: controls must not become their own hover targets.
          disabled={!current || !current.capabilities[action]}
          aria-disabled={pending || undefined}
          className="relative z-10 shrink-0 cursor-pointer rounded p-1 disabled:cursor-default disabled:opacity-40"
          onClick={() => {
            if (!pending) onClick({ action })
          }}
        >
          <WidgetItemIcon icon={Icon} size={14} className="text-secondary" />
        </button>
      ))}
    </div>
  )
}
