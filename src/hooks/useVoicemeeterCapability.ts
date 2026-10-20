import { useEffect, useState } from 'react'
import { bridge } from '../services/system/bridge'

// One capability request per session; `voicemeeter` presence does not change
// while the bar runs.
let cached: Promise<boolean> | null = null

function ensureVoicemeeterCapability(): Promise<boolean> {
  cached ??= Promise.resolve(
    bridge
      .capabilities?.()
      .then((map) => map.voicemeeter === true)
      .catch(() => false) ?? Promise.resolve(false)
  )
  return cached
}

/** Test-only: clears the module capability cache between suites. */
export function resetVoicemeeterCapability() {
  cached = null
}

/**
 * Whether the native host detected a Voicemeeter installation (the DLL). The
 * routing menu renders only when this flips true.
 */
export function useVoicemeeterCapability() {
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    let mounted = true
    void ensureVoicemeeterCapability().then((available) => {
      if (mounted) setAvailable(available)
    })
    return () => {
      mounted = false
    }
  }, [])
  return available
}
