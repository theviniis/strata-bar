import { WeatherWidget } from './weather.widget'
import { useWidgetView } from '@/components/status-bar/widget-view'
import { useOverlayTooltip } from '@/hooks/use-overlay-tooltip'
import type { SystemEvent } from '@/services/system/bridge'
import type { WeatherData } from '@/services/system/weather.generated'
import { condition } from '../src/presentation'
import { useWeather } from '../src/use-weather'

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
    <WeatherWidget
      data={data}
      weather={weather}
      text={text}
      view={view}
      tip={tip}
    />
  )
}
