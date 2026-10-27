import { useEffect, useRef } from 'react'
import { useWidgetRuntime } from '@/components/status-bar/widget-runtime-context'

/** Native owns placement; report only the widget's viewport rectangle in CSS px. */
export function useReminderAnchor() {
  const runtime = useWidgetRuntime()
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(
    () =>
      runtime.effect(() => {
        if (!window.__TAURI_INTERNALS__) return
        const node = ref.current
        if (!node) return
        let active = true
        let unlisten: (() => void) | undefined
        const report = async (occurrence?: string) => {
          const rect = node.getBoundingClientRect()
          if (!active || rect.width <= 0 || rect.height <= 0) return
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            if (!active) return
            await invoke('reminders_set_anchor', {
              anchor: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
              },
              occurrence: occurrence ?? null
            })
          } catch (error) {
            if (active) console.error('Reminder anchor', error)
          }
        }
        const observer = new ResizeObserver(() => void report())
        observer.observe(node)
        observer.observe(document.documentElement)
        const onResize = () => void report()
        window.addEventListener('resize', onResize)
        void import('@tauri-apps/api/event')
          .then(async ({ listen }) => {
            const stop = await listen<string>(
              'reminders:measure-anchor',
              (event) => void report(event.payload)
            )
            if (!active) stop()
            else {
              unlisten = stop
              await report()
            }
          })
          .catch((error) => {
            if (active) console.error('Reminder anchor listener', error)
          })
        return () => {
          active = false
          observer.disconnect()
          window.removeEventListener('resize', onResize)
          unlisten?.()
        }
      }),
    [runtime]
  )
  return ref
}
