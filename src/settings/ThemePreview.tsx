import { useEffect, useRef, useState } from 'react'
import { DemoWidget } from '@/components/status-bar/DemoWidget'
import { NativeBarSurface } from '@/components/status-bar/NativeBar'
import type { Config } from '@/services/configuration/config'
import { cn } from '@/lib/utils'

const PREVIEW_WIDTH = 1440

/** The NativeBar renderer, fitted to the selector with studio sample data. */
export function ThemePreview({ config }: { config: Config }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(PREVIEW_WIDTH)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const scale = Math.min(1, width / PREVIEW_WIDTH)
  return (
    <div
      ref={ref}
      inert
      aria-hidden="true"
      data-theme-preview={config.bar.theme}
      className={cn(
        'relative h-24 w-full overflow-hidden rounded-md border border-border bg-muted',
        config.bar.theme === 'dark' ? 'dark' : 'light'
      )}
    >
      <div
        style={{
          width: PREVIEW_WIDTH,
          height: config.bar.height,
          transform: `scale(${scale})`,
          transformOrigin: 'top left'
        }}
      >
        <NativeBarSurface
          preview
          widgets={config.widgets}
          bar={config.bar}
          renderWidget={(widget) => (
            <DemoWidget widget={widget} staticPreview />
          )}
        />
      </div>
    </div>
  )
}
