import { getISOWeek } from 'date-fns'

/** Formatting belongs to the data boundary; visuals consume these explicit strings. */
export function timePresentation(now: Date, locale?: string) {
  return {
    now,
    dateTime: now.toISOString(),
    hours: now.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    }),
    date: now.toLocaleDateString(locale, {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }),
    text: now.toLocaleDateString(locale, { dateStyle: 'full' }),
    day: now.toLocaleDateString('pt-BR', { weekday: 'long' }),
    month: now.toLocaleDateString('pt-BR', { month: 'long' }),
    year: now.getFullYear(),
    week: getISOWeek(now)
  }
}
export type TimePresentation = ReturnType<typeof timePresentation>
