import { useEffect, useMemo, useState } from 'react'
import { useWidgetPreview } from '@/components/status-bar/widget-preview-context'
import { PREVIEW_TIME } from '@/services/system/widget-preview'
import { timePresentation } from './presentation'

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
  return useMemo(
    () => timePresentation(preview ? new Date(PREVIEW_TIME) : now),
    [now, preview]
  )
}
