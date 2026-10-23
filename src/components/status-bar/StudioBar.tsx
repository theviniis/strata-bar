import type { Config } from '@/services/configuration/config'
import { useEffect, useRef, useState } from 'react'
import { DemoWidget } from './DemoWidget'
import { NativeBarSurface } from './NativeBar'
import { cornerRadius } from './curves'

const BAR_WIDTH = 1440

/** One demo bar renderer shared by the studio and the settings theme selector. */
export function StudioBar({
  config,
  staticPreview = false
}: {
  config: Config
  staticPreview?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(BAR_WIDTH)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(1, width / BAR_WIDTH)
  const height = config.bar.height + cornerRadius(config.bar)
  return (
    <div
      ref={ref}
      className="w-full overflow-hidden"
      style={{ height: height * scale }}
    >
      <div
        style={{
          width: Math.max(width, BAR_WIDTH),
          height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        <NativeBarSurface
          preview
          ariaLabel="Status bar"
          widgets={config.widgets}
          bar={config.bar}
          renderWidget={(widget) => (
            <DemoWidget widget={widget} staticPreview={staticPreview} />
          )}
        />
      </div>
    </div>
  )
}
