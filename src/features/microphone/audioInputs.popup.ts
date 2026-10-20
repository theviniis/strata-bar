import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Entrada de áudio',
  Content: lazyContent(() => import('./AudioInputs'), 'AudioInputs')
})
