import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Clima',
  Content: lazyContent(
    () => import('./weather.popup'),
    'WeatherPopupController'
  )
})
