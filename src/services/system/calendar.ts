import { z } from 'zod'
import type { CalendarStatus } from './reminders.generated'

const status: z.ZodType<CalendarStatus> = z
  .object({
    connected: z.boolean(),
    connecting: z.boolean(),
    error: z.string().nullable()
  })
  .strict()

async function call(command: string, args?: Record<string, unknown>) {
  if (!window.__TAURI_INTERNALS__) {
    throw new Error('Google Calendar está disponível na barra nativa')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return status.parse(await invoke(command, args))
}

export const calendar = {
  status: () => call('calendar_status'),
  connect: (clientId: string, clientSecret: string) =>
    call('calendar_connect', { clientId, clientSecret }),
  disconnect: () => call('calendar_disconnect')
}
