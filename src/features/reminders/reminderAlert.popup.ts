import { z } from 'zod'
import { definePopup, lazyContent } from '@/popups/definition'

export default definePopup({
  label: 'Alerta de lembrete',
  Content: lazyContent(
    () => import('./ReminderAlertController'),
    'ReminderAlertController'
  ),
  schema: z
    .object({
      id: z.uuid(),
      revision: z.number().int().nonnegative().optional()
    })
    .strict()
})
