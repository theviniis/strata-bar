import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Discos',
  Content: lazyContent(
    () => import('./DiskPopupController'),
    'DiskPopupController'
  )
})
