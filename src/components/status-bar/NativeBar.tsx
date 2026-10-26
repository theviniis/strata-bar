import desktopCorner from '@/assets/bar-desktop-corner.svg'
import { useAudioRouting } from '@/hooks/useAudioRouting'
import { useBarRegion } from '@/hooks/useBarRegion'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { barTextClasses } from '@/lib/typography'
import { cn } from '@/lib/utils'
import type { Config, WidgetConfig } from '@/services/configuration/config'
import { isWidgetAvailable } from '@/services/configuration/widget-flags'
import { themeStyle } from '@/services/theme/palettes'
import { useConfig } from '@/stores/config'
import { useMemo, useRef, type ReactNode } from 'react'
import { QueryProvider } from '../QueryProvider'
import { SlidingHighlight } from '../ui/sliding-highlight'
import { cornerRadius, groupEdgeMask } from './curves'
import { SeparatorMarginContext } from './separator-margin'
import { Widget } from './Widget'

/** Order-preserving section filter: presence and order both come from config. */
function enabled(widgets: WidgetConfig[]) {
  return widgets.filter(
    (widget) => widget.enabled && isWidgetAvailable(widget.type)
  )
}

/**
 * The rejection the native store reported, shown on the bar so a hand edit that
 * failed is never silent. The last good configuration keeps rendering behind
 * it; the editor surfaces the same reason in full.
 */
function ConfigWarning({ message }: { message: string }) {
  return (
    <span
      role="alert"
      title={message}
      aria-label={`Configuração não aplicada: ${message}`}
      className="shrink-0 cursor-help px-1 text-micro text-destructive"
    >
      ⚠
    </span>
  )
}

/**
 * The real Windows status bar, rendered from the configuration the native
 * store publishes. Widget presence, order, enabled state, format, tooltip,
 * theme and spacing all come from that one document; the bar holds no hardcoded
 * widget list, so a hand edit reaches every monitor without a restart. Geometry
 * stays native (`desktop.rs`) and per-monitor overrides arrive already
 * projected for this window.
 */
export default function NativeBar() {
  const widgets = useConfig((state) => state.config.widgets)
  const bar = useConfig((state) => state.config.bar)
  const error = useConfig((state) => state.error)

  const audio = useConfig((state) => state.config.audio)
  useAudioRouting(audio)

  return <NativeBarSurface widgets={widgets} bar={bar} error={error} />
}

/** Shared geometry and styling for the real AppBar and its inert studio previews. */
export function NativeBarSurface({
  widgets,
  bar,
  error = null,
  renderWidget,
  preview = false,
  ariaLabel = 'Barra de status Strata'
}: {
  widgets: Config['widgets']
  bar: Config['bar']
  error?: string | null
  renderWidget?: (widget: WidgetConfig) => ReactNode
  preview?: boolean
  ariaLabel?: string
}) {
  const theme = useResolvedTheme(bar.theme)
  const regionRef = useRef<HTMLElement>(null)
  useBarRegion(regionRef, bar, preview)
  const radius = cornerRadius(bar)
  const edgeMask = groupEdgeMask(bar.height, radius)
  const sections = useMemo(
    () =>
      [
        ['left', enabled(widgets.left)],
        ['center', enabled(widgets.center)],
        ['right', enabled(widgets.right)]
      ] as const,
    [widgets]
  )
  return (
    <SeparatorMarginContext value={bar.separatorMarginX ?? 0}>
      <QueryProvider>
        {/* Explicit tokens isolate this bar from surrounding preview palettes. */}
        <div
          onContextMenu={(event) => event.preventDefault()}
          data-theme={theme}
          data-color-theme={bar.colorTheme}
          style={themeStyle(bar.colorTheme, theme)}
          className={cn(
            'group flex h-full w-full flex-col',
            bar.position === 'bottom' && 'justify-end',
            theme
          )}
        >
          <SlidingHighlight>
            <nav
              ref={regionRef}
              className={cn(
                !preview && 'native-bar',
                barTextClasses,
                'relative grid h-full w-full grid-cols-[1fr_max-content_1fr] grid-rows-1 items-center bg-transparent text-foreground'
              )}
              aria-label={ariaLabel}
              style={{ gap: bar.spacing, height: bar.height, flexShrink: 0 }}
            >
              {sections.map(([name, widgets]) => (
                <div
                  key={name}
                  data-section={name}
                  className={cn(
                    'relative flex h-full min-w-0 items-center py-1.5',
                    name === 'center'
                      ? 'justify-self-center'
                      : name === 'right'
                        ? 'justify-self-end justify-end'
                        : 'justify-self-start'
                  )}
                  style={{
                    gap: bar.spacing,
                    paddingLeft:
                      widgets.length > 0 || (name === 'right' && error)
                        ? name === 'left'
                          ? 4
                          : radius * 1.5
                        : 0,
                    paddingRight:
                      widgets.length > 0 || (name === 'right' && error)
                        ? name === 'right'
                          ? 4
                          : radius * 1.5
                        : 0
                  }}
                >
                  {name !== 'center' && widgets.length > 0 && radius > 0 && (
                    <span
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute bg-background',
                        name === 'left' ? 'left-0' : 'right-0 -scale-x-100',
                        bar.position === 'bottom'
                          ? 'bottom-full -scale-y-100'
                          : 'top-full'
                      )}
                      style={{
                        width: radius,
                        height: radius,
                        mask: `url("${desktopCorner}") center / 100% 100% no-repeat`
                      }}
                    />
                  )}
                  {(widgets.length > 0 || (name === 'right' && error)) && (
                    <div
                      aria-hidden="true"
                      className={cn(
                        'pointer-events-none absolute inset-0 -z-20 flex',
                        bar.position === 'bottom' && '-scale-y-100'
                      )}
                    >
                      <span
                        className="h-full shrink-0 bg-background glass-surface backdrop-blur-lg"
                        style={{
                          width: name === 'left' ? 0 : radius * 2,
                          mask: name === 'left' ? undefined : edgeMask
                        }}
                      />
                      <span className="h-full flex-1 bg-background glass-surface backdrop-blur-lg" />
                      <span
                        className="h-full shrink-0 -scale-x-100 bg-background glass-surface backdrop-blur-lg"
                        style={{
                          width: name === 'right' ? 0 : radius * 2,
                          mask: name === 'right' ? undefined : edgeMask
                        }}
                      />
                    </div>
                  )}
                  {widgets.map((widget) => (
                    <div
                      key={widget.id}
                      data-bar-item
                      className="group/bar-item flex min-h-0 min-w-0 self-stretch items-center empty:hidden"
                      style={{ gap: bar.spacing }}
                    >
                      {renderWidget ? (
                        renderWidget(widget)
                      ) : (
                        <Widget widget={widget} />
                      )}
                    </div>
                  ))}
                  {name === 'right' && error && (
                    <ConfigWarning message={error} />
                  )}
                </div>
              ))}
            </nav>
          </SlidingHighlight>
        </div>
      </QueryProvider>
    </SeparatorMarginContext>
  )
}
