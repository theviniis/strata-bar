import {
  WidgetItem,
  WidgetItemIcon,
  WidgetItemLabel,
  WidgetItemOutput,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useOverlayTooltip } from '@/hooks/useOverlayTooltip'
import { WidgetPopup } from '@/popups/WidgetPopup'
import type { SystemEvent } from '@/services/system/bridge'
import type { WeatherData } from '@/services/system/weather.generated'
import { useWeather } from './useWeather'
import { condition, temperature } from './presentation'

export function WeatherController() {
  return <WeatherTrigger event={useWeather()} />
}
function WeatherTrigger({ event }: { event: SystemEvent<WeatherData> }) {
  const view = useWidgetView()
  const data = event.status === 'ready' ? event.data : undefined
  const weather = condition(data?.code ?? null, data?.isDay)
  const text = data?.city
    ? `${data.city.name} · ${weather.label}${data.stale ? ' · Leitura desatualizada' : ''}`
    : event.status === 'loading'
      ? 'Carregando clima'
      : event.status === 'error'
        ? event.error
        : 'Escolha uma cidade nas configurações de Clima'
  const tip = useOverlayTooltip(view.tooltip ? text : '')
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
