import { usePopupContext } from '@/popups/context'
import { weatherFixture } from '../src/fixtures'
import { useWeather } from '../src/use-weather'
import { WeatherPopup } from './weather.popup'

export function WeatherPopupController() {
  const { mode } = usePopupContext('weather')
  return mode === 'native' ? (
    <NativeWeatherPopup />
  ) : (
    <WeatherPopup event={{ status: 'ready', data: weatherFixture() }} demo />
  )
}

function NativeWeatherPopup() {
  return (
    <WeatherPopup
      event={useWeather()}
      availableSize={{
        width: window.screen.availWidth,
        height: window.screen.availHeight
      }}
    />
  )
}
