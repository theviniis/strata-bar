import { discoveredPopups } from './.generated/popups'

type Warmable = { Content: { preload?: () => Promise<unknown> } }

/** Import modules only; mounting and subscriptions remain owned by PopupHost. */
export function warmPopupContents(
  entries: readonly Warmable[] = Object.values(discoveredPopups)
) {
  let cancelled = false
  let index = 0
  let cancelScheduled: (() => void) | undefined
  const schedule = () => {
    if (cancelled || index >= entries.length) return
    const run = () => {
      cancelScheduled = undefined
      if (cancelled) return
      const entry = entries[index++]
      void Promise.resolve()
        .then(() => entry.Content.preload?.())
        .catch((error: unknown) => console.warn('Popup warmup', error))
        .then(schedule)
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(run, { timeout: 1000 })
      cancelScheduled = () => window.cancelIdleCallback(handle)
    } else {
      const handle = window.setTimeout(run, 100)
      cancelScheduled = () => window.clearTimeout(handle)
    }
  }
  schedule()
  return () => {
    cancelled = true
    cancelScheduled?.()
  }
}
