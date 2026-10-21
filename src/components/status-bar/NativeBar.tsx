import { useMemo } from 'react'
import type { WidgetConfig } from '@/services/configuration/config'
import { useConfig } from '@/stores/config'
import { BarVerticalSeparator } from '../ui/bar-vertical-separator'
import { QueryProvider } from '../QueryProvider'
import { Widget } from './Widget'
import { WidgetHoverGroup } from '../widget-hover'
import { useAudioRouting } from '@/hooks/useAudioRouting'

/** Order-preserving section filter: presence and order both come from config. */
function enabled(widgets: WidgetConfig[]) {
  return widgets.filter((widget) => widget.enabled)
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
      className="shrink-0 cursor-help px-1 text-[10px] text-destructive"
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

  // Push audio routing for all volume/microphone widgets in this bar's config
  // on mount and on config changes. The native worker applies last-write-wins
  // per channel, so the order in the config array determines priority.
  useAudioRouting([widgets.left, widgets.center, widgets.right])

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
    <QueryProvider>
      <WidgetHoverGroup>
        {/*
          The theme root owns `group` and `data-theme` so every `group-data-[theme=light]:`
          utility below — including the nav's own colours — matches a descendant. On a single
          element the variant cannot select itself, which left the light theme unpainted.
        */}
        <div data-theme={bar.theme} className="group h-full w-full">
          <nav
            className="native-bar relative grid h-full w-full grid-cols-[1fr_max-content_1fr] items-center border-b border-[#ffffff12] px-3.5 font-['Segoe_UI',sans-serif] text-[11px] leading-[normal] text-[#e4e5ed] tabular-nums select-none group-data-[theme=light]:bg-[#f8f5f2] group-data-[theme=light]:text-[#302a3e]"
            aria-label="Barra de status Strata"
            style={{ gap: bar.spacing }}
          >
            {sections.map(([name, widgets]) => (
              <div
                key={name}
                data-section={name}
                className={
                  name === 'center'
                    ? 'flex justify-self-center items-center'
                    : name === 'right'
                      ? 'flex shrink-0 items-center ml-auto justify-end'
                      : 'flex min-w-0 items-center'
                }
                style={{ gap: bar.spacing }}
              >
                {widgets.map((widget, index) => (
                  <div
                    key={widget.id}
                    className="flex min-w-0 items-center"
                    style={{ gap: bar.spacing }}
                  >
                    {index > 0 && <BarVerticalSeparator />}
                    <Widget widget={widget} />
                  </div>
                ))}
                {name === 'right' && error && <ConfigWarning message={error} />}
              </div>
            ))}
          </nav>
        </div>
      </WidgetHoverGroup>
    </QueryProvider>
  )
}
