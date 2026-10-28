import { useEffect, useRef, useState } from 'react'
import { useResourceChannel } from '@/hooks/use-resource-channel'
import { usePopupContext } from '@/popups/context'
import { bridge } from '@/services/system/bridge'
import { useConfig } from '@/stores/config'
import { networkFixture } from '../src/fixtures'
import { NetworkPopup } from './network.popup'

export function NetworkPopupController() {
  const { mode } = usePopupContext('network')
  return mode === 'native' ? <NativeNetworkPopup /> : <DemoNetworkPopup />
}
function NativeNetworkPopup() {
  const { event, now } = useResourceChannel('network')
  const config = useConfig((s) => s.config.network)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function action(operation: (() => Promise<void>) | undefined) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      if (!operation) throw new Error('Comando de rede indisponível')
      await operation()
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <NetworkPopup
      availableSize={{
        width: window.screen.availWidth,
        height: window.screen.availHeight
      }}
      event={event}
      now={now}
      unit={config?.unit}
      busy={busy}
      actionError={error}
      onStart={() => void action(bridge.networkTestStart)}
      onCancel={() => void action(bridge.networkTestCancel)}
    />
  )
}
function DemoNetworkPopup() {
  const [data, setData] = useState(networkFixture)
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)
  useEffect(() => () => clearInterval(timer.current), [])
  function cancel() {
    clearInterval(timer.current)
    setData((d) => ({
      ...d,
      speedTest: { ...d.speedTest, phase: 'cancelled' }
    }))
  }
  function start() {
    clearInterval(timer.current)
    const start = Date.now()
    timer.current = setInterval(() => {
      const elapsed = Date.now() - start
      setData((d) => ({
        ...d,
        speedTest: {
          ...d.speedTest,
          phase:
            elapsed >= 30000
              ? 'complete'
              : elapsed < 15000
                ? 'download'
                : 'upload',
          downloadMbps: 350,
          uploadMbps: elapsed >= 15000 ? 120 : null,
          elapsedMs: Math.min(elapsed, 30000),
          stageProgress: elapsed >= 30000 ? 1 : (elapsed % 15000) / 15000,
          transferredBytes: Math.min(elapsed * 2000, 80_000_000),
          timestamp: start,
          interfaceName: 'Ethernet (demonstração)'
        }
      }))
      if (elapsed >= 30000) clearInterval(timer.current)
    }, 250)
  }
  return (
    <NetworkPopup
      event={{ status: 'ready', data }}
      now={data.sampledAt}
      demo
      onStart={start}
      onCancel={cancel}
    />
  )
}
