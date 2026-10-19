import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'GPU',
  Content: lazyContent(() => import('./GpuPopup'), 'GpuPopup')
})
