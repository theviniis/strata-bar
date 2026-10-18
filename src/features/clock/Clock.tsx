import { useEffect, useState } from 'react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'

export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      setNow(new Date())
      timer = setTimeout(update, 60000 - (Date.now() % 60000))
    }
    update()
    return () => clearTimeout(timer)
  }, [])
  const text = now.toLocaleDateString(undefined, { dateStyle: 'full' })
  const tip = useOverlayTooltip(text)
  return (
    <time
      className="flex items-center gap-3"
      dateTime={now.toISOString()}
      aria-describedby={tip.describedBy}
      {...tip.trigger}
    >
      <strong className="text-[12px] font-semibold">
        {now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </strong>
      <span className="text-[10px] text-[#9696a9] max-[650px]:hidden">
        {now.toLocaleDateString(undefined, {
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        })}
      </span>
      <span id={tip.describedBy} role="tooltip" className="sr-only">
        {text}
      </span>
    </time>
  )
}
