import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Player de musica',
  Content: lazyContent(() => import('./MusicPopup'), 'MusicPopup')
})
