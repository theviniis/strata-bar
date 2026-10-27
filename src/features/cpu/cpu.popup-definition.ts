import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'CPU',
  Content: lazyContent(() => import('./cpu.popup'), 'CpuPopupController')
})
