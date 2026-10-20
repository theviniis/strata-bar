import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Saída de áudio',
  Content: lazyContent(() => import('./AudioOutputs'), 'AudioOutputs')
})
