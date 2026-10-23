import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Lembretes',
  Content: lazyContent(
    () => import('./RemindersPopupController'),
    'RemindersPopupController'
  )
})
