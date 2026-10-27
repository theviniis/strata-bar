import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { WidgetPopup } from '@/popups/WidgetPopup'
import type { WidgetView } from '@/components/status-bar/presentation'
import type { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import type { WeatherData } from '@/services/system/weather.generated'
import { condition, temperature } from '../src/presentation'

export function WeatherWidget({
  data,
  weather,
  text,
  view,
  tip
}: {
  data: WeatherData | undefined
  weather: ReturnType<typeof condition>
  text: string
  view: WidgetView
  tip: ReturnType<typeof useOverlayTooltip>
}) {
  return (
    <WidgetPopup.Root popup="weather">
      <WidgetPopup.Trigger asChild>
        <WidgetItem
          {...tip.trigger}
          aria-label={`Clima: ${text}`}
          aria-describedby={view.tooltip ? tip.describedBy : undefined}
        >
          <WidgetItemIcon icon={weather.Icon} aria-hidden="true" />
          {view.format === 'label' && <WidgetItemLabel>Clima</WidgetItemLabel>}
          <WidgetItemOutput className="tabular-nums">
            {data?.city
              ? temperature(data.temperature, data.temperatureUnit)
              : '—'}
          </WidgetItemOutput>
        </WidgetItem>
      </WidgetPopup.Trigger>
      {view.tooltip && (
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      )}
    </WidgetPopup.Root>
  )
}
