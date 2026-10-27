import { z } from 'zod'
import { scheduledDateTime } from './presentation'

export const reminderFormSchema = z
  .object({
    mode: z.enum(['duration', 'dateTime']),
    message: z
      .string()
      .trim()
      .min(1, 'Informe a mensagem')
      .max(2000, 'Use no maximo 2000 caracteres'),
    duration: z.string(),
    date: z.date().optional(),
    time: z.string(),
    eventDuration: z.string(),
    syncCalendar: z.boolean()
  })
  .superRefine((values, context) => {
    if (values.mode === 'duration') {
      if (
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(values.duration) ||
        values.duration === '00:00'
      ) {
        context.addIssue({
          code: 'custom',
          path: ['duration'],
          message: 'Informe uma duracao valida em horas e minutos'
        })
      }
      return
    }
    const seconds = Number(values.eventDuration) * 60
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 4_294_967_295) {
      context.addIssue({
        code: 'custom',
        path: ['eventDuration'],
        message: 'Informe uma duracao valida para o evento'
      })
    }
    try {
      if (scheduledDateTime(values.date, values.time) <= Date.now()) {
        context.addIssue({
          code: 'custom',
          path: ['time'],
          message: 'Escolha uma data e hora no futuro'
        })
      }
    } catch (error) {
      context.addIssue({
        code: 'custom',
        path: ['time'],
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

export type ReminderFormValues = z.infer<typeof reminderFormSchema>
