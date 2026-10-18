import {
  WidgetItem,
  WidgetItemLabel,
  WidgetItemTooltip
} from '@/components/widget-item'
import { useEffect, useState } from 'react'
import { useOverlayTooltip } from '../../hooks/useOverlayTooltip'

export interface ClockProps {
  showDate?: boolean
}

export function Clock({ showDate = false }: ClockProps) {
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
    <WidgetItem asChild>
      <time
        dateTime={now.toISOString()}
        aria-describedby={tip.describedBy}
        {...tip.trigger}
      >
        <WidgetItemLabel className="font-semibold">
          {now.toLocaleTimeString(undefined, {
            hour: '2-digit',
            minute: '2-digit'
          })}
        </WidgetItemLabel>
        {showDate && (
          <span className="text-[10px] text-[#9696a9]">
            {now.toLocaleDateString(undefined, {
              weekday: 'short',
              day: '2-digit',
              month: 'short'
            })}
          </span>
        )}
        <WidgetItemTooltip id={tip.describedBy}>{text}</WidgetItemTooltip>
      </time>
    </WidgetItem>
  )
}
