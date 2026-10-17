import { useEffect, useState } from 'react'
export function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer
    const update = () => {
      setNow(new Date())
      timer = setTimeout(update, 60000 - (Date.now() % 60000))
    }
    update()
    return () => clearTimeout(timer)
  }, [])
  return (
    <time
      className="bar-clock"
      dateTime={now.toISOString()}
      title={now.toLocaleDateString(undefined, { dateStyle: 'full' })}
    >
      <strong>
        {now.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit'
        })}
      </strong>
      <span>
        {now.toLocaleDateString(undefined, {
          weekday: 'short',
          day: '2-digit',
          month: 'short'
        })}
      </span>
    </time>
  )
}
