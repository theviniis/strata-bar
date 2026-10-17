import { useEffect, useState } from 'react'

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
  return (
    <time
      className="flex items-center gap-[12px]"
      dateTime={now.toISOString()}
      title={now.toLocaleDateString(undefined, { dateStyle: 'full' })}
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
    </time>
  )
}
