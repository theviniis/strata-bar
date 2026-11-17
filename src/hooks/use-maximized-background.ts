import { useEffect, useState } from 'react'

export function useMaximizedBackground(enabled: boolean) {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    if (!enabled || !('__TAURI_INTERNALS__' in window)) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const update = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const value = await invoke<boolean>('bar_has_maximized')
        if (!stopped) setMaximized(value)
      } catch (error) {
        if (!stopped) {
          setMaximized(false)
          console.error('Maximized window detection:', error)
        }
      } finally {
        if (!stopped) timer = setTimeout(update, 250)
      }
    }
    void update()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [enabled])
  return enabled && maximized
}
