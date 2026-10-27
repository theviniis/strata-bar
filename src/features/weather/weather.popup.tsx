import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Clima',
  Content: lazyContent(
    () => import('./WeatherPopupController'),
    'WeatherPopupController'
  )
})
