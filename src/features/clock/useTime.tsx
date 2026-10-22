import { getISOWeek } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { PREVIEW_TIME } from '@/services/system/widget-preview'

export function useTime() {
  const preview = useWidgetPreview()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (preview) return
    let timer: ReturnType<typeof setTimeout>

    const update = () => {
      setNow(new Date())
      timer = setTimeout(update, 60000 - (Date.now() % 60000))
    }

    update()
    return () => clearTimeout(timer)
  }, [preview])

  return useMemo(() => {
    const displayed = preview ? new Date(PREVIEW_TIME) : now
    return {
      now: displayed,
      dateTime: displayed.toISOString(),
      hours: displayed.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit'
      }),
      date: displayed.toLocaleDateString(undefined, {
        weekday: 'short',
        day: '2-digit',
        month: 'short'
      }),
      text: displayed.toLocaleDateString(undefined, { dateStyle: 'full' }),
      day: displayed.toLocaleDateString('pt-BR', { weekday: 'long' }),
      month: displayed.toLocaleDateString('pt-BR', { month: 'long' }),
      year: displayed.getFullYear(),
      week: getISOWeek(displayed)
    }
  }, [now, preview])
}
