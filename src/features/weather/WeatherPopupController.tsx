import { usePopupContext } from '@/popups/context'
import { WeatherPopup } from './WeatherPopup'
import { weatherFixture } from './fixtures'
import { useWeather } from './useWeather'

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
