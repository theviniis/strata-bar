export function createMockBridge() {
  const values = {
    cpu: 17,
    memory: 46,
    gpu: null,
    network: 128,
    volume: 64,
    activeWindow: 'Visual Studio Code'
  }
  return {
    mode: 'demo',
    async subscribe(channel, listener, { intervalMs = 2000 } = {}) {
      const emit = () =>
        listener({
          status: channel === 'gpu' ? 'unavailable' : 'ready',
          data: values[channel],
          timestamp: Date.now()
        })
      emit()
      const timer = ['cpu', 'memory', 'network'].includes(channel)
        ? setInterval(emit, intervalMs)
        : null
      return () => clearInterval(timer)
    },
    async setVolume() {
      throw new Error('Volume control is unavailable in browser demo')
    }
  }
}
export function createNativeBridge() {
  return {
    mode: 'native',
    async subscribe(channel, listener, options) {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')
      let receivedEvent = false
      const stop = await listen(`system:${channel}`, (e) => {
        receivedEvent = true
        listener(e.payload)
      })
      let token
      try {
        const subscription = await invoke('subscribe', {
          channel,
          intervalMs: options.intervalMs
        })
        token = subscription.token
        if (!receivedEvent) listener(subscription.initial)
      } catch (e) {
        stop()
        throw e
      }
      let disposed = false
      return async () => {
        if (disposed) return
        disposed = true
        stop()
        await invoke('unsubscribe', { token })
      }
    },
    async setVolume(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_volume', value)
    },
    async quit() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('quit')
    }
  }
}
export const bridge =
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__
    ? createNativeBridge()
    : createMockBridge()
// Own asynchronous setup and teardown, including unmount before setup resolves.
export function connect(bridge, channel, options, onValue, onError) {
  let cancelled = false,
    dispose
  Promise.resolve()
    .then(() =>
      bridge.subscribe(
        channel,
        (value) => {
          if (!cancelled) onValue(value)
        },
        options
      )
    )
    .then((fn) => {
      if (cancelled) return fn()
      dispose = fn
    })
    .catch((e) => {
      if (!cancelled) onError(e)
      else console.error('Subscription cleanup failed', e)
    })
  return () => {
    if (cancelled) return
    cancelled = true
    if (dispose) Promise.resolve().then(dispose).catch(onError)
  }
}
