import { getISOWeek } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

export function useTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const update = () => {
      setNow(new Date())
      timer = setTimeout(update, 60000 - (Date.now() % 60000))
    }

    update()
    return () => clearTimeout(timer)
  }, [])

  return useMemo(
    () => ({
      now,
      dateTime: now.toISOString(),
      hours: now.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }),
      date: now.toLocaleDateString(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }),
      text: now.toLocaleDateString(undefined, { dateStyle: 'full' }),
      day: now.toLocaleDateString('pt-BR', { weekday: 'long' }),
      month: now.toLocaleDateString('pt-BR', { month: 'long' }),
      year: now.getFullYear(),
      week: getISOWeek(now)
    }),
    [now]
  )
}
