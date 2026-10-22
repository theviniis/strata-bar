import { useCallback, useEffect, useState } from 'react'
import { bridge } from '@/services/system/bridge'
import type { SettingsMonitor } from '@/services/system/config.generated'

export function useMonitors() {
  const [monitors, setMonitors] = useState<SettingsMonitor[]>([])
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    if (bridge.mode === 'demo') {
      const demo = await Promise.resolve([
        {
          id: 'studio-demo',
          deviceName: 'studio-demo',
          name: 'Demonstração',
          width: 1920,
          height: 1080,
          primary: true
        }
      ])
      setMonitors(demo)
      return
    }
    try {
      if (!bridge.settingsMonitors)
        throw new Error('Consulta de monitores indisponível')
      setMonitors(await bridge.settingsMonitors())
      setError(null)
    } catch (reason) {
      setError(String(reason))
    }
  }, [])
  useEffect(() => {
    let alive = true
    let unlisten: (() => void) | undefined
    void Promise.resolve().then(refresh)
    if (bridge.mode === 'native')
      void import('@tauri-apps/api/event')
        .then(({ listen }) =>
          listen<SettingsMonitor[]>('monitors:changed', (event) => {
            if (alive) {
              setMonitors(event.payload)
              setError(null)
            }
          })
        )
        .then((stop) => {
          if (alive) unlisten = stop
          else stop()
        })
        .catch(() => {})
    return () => {
      alive = false
      unlisten?.()
    }
  }, [refresh])
  return { monitors, error, refresh }
}
