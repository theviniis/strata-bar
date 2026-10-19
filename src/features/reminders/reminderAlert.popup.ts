import { z } from 'zod'
import { definePopup } from '@/popups/definition'
import { ReminderAlert } from './ReminderAlert'

export default definePopup({
  label: 'Alerta de lembrete',
  Content: ReminderAlert,
  schema: z
    .object({
      id: z.uuid(),
      revision: z.number().int().nonnegative().optional()
    })
    .strict()
})
