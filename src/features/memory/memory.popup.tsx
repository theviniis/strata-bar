import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Memória',
  Content: lazyContent(
    () => import('./MemoryPopupController'),
    'MemoryPopupController'
  )
})
