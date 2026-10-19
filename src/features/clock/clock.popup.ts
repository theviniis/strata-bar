import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Calendário',
  Content: lazyContent(() => import('./ClockPopup'), 'ClockPopup')
})
