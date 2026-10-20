import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Agentes de IA',
  Content: lazyContent(() => import('./AgentsPopup'), 'AgentsPopup')
})
