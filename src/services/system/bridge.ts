export type BridgeMode = 'demo' | 'native'

/** Channels the UI can subscribe to. The clock renders locally, without a channel. */
export type Channel =
  'cpu' | 'memory' | 'gpu' | 'network' | 'volume' | 'activeWindow'

/** Payloads published by the native collectors. */
export interface ChannelData {
  cpu: { percent: number }
  memory: { percent: number; usedBytes: number; totalBytes: number }
  gpu: null
  network: number
  volume: { level: number; muted: boolean }
  activeWindow: string
}

/**
 * Illustrative scalars served by the browser demo adapter. They are preview values
 * only, so they deliberately do not mirror the native payloads above.
 */
export interface DemoChannelData {
  cpu: number
  memory: number
  gpu: null
  network: number
  volume: number
  activeWindow: string
}

export type SystemStatus = 'loading' | 'ready' | 'unavailable' | 'error'

/** Native event envelope. The event name identifies the channel. */
export type SystemEvent<D = unknown> =
  | { status: 'loading'; data?: null; timestamp?: number }
  | { status: 'unavailable'; data?: null; timestamp?: number }
  | { status: 'ready'; data: D; timestamp?: number }
  | { status: 'error'; data?: null; error: string; timestamp?: number }

export interface SubscribeOptions {
  intervalMs?: number
}

export type VolumeChange = { level?: number; muted?: boolean }

export interface Subscribable<D extends Record<Channel, unknown>> {
  subscribe<C extends Channel>(
    channel: C,
    listener: (event: SystemEvent<D[C]>) => void,
    options?: SubscribeOptions
  ): Promise<() => void>
}

export interface AdapterBase {
  setVolume(value: VolumeChange): Promise<unknown>
  /** Only the native adapter owns the process, so the demo adapter cannot quit. */
  quit?(): Promise<void>
}

export interface DemoBridge extends AdapterBase, Subscribable<DemoChannelData> {
  mode: 'demo'
}

export interface NativeBridge extends AdapterBase, Subscribable<ChannelData> {
  mode: 'native'
}

export type Bridge = DemoBridge | NativeBridge

export function createMockBridge(): DemoBridge {
  const values: DemoChannelData = {
    cpu: 17,
    memory: 46,
    gpu: null,
    network: 128,
    volume: 64,
    activeWindow: 'Visual Studio Code'
  }
  return {
    mode: 'demo',
    async subscribe<C extends Channel>(
      channel: C,
      listener: (event: SystemEvent<DemoChannelData[C]>) => void,
      { intervalMs = 2000 } = {}
    ) {
      const emit = () => {
        const data = values[channel]
        if (channel === 'gpu') {
          listener({ status: 'unavailable', data: null, timestamp: Date.now() })
        } else {
          listener({ status: 'ready', data, timestamp: Date.now() })
        }
      }
      emit()
      const timer = ['cpu', 'memory', 'network'].includes(channel)
        ? setInterval(emit, intervalMs)
        : undefined
      return () => clearInterval(timer)
    },
    async setVolume() {
      throw new Error('Volume control is unavailable in browser demo')
    }
  }
}

export function createNativeBridge(): NativeBridge {
  return {
    mode: 'native',
    async subscribe<C extends Channel>(
      channel: C,
      listener: (event: SystemEvent<ChannelData[C]>) => void,
      options?: SubscribeOptions
    ) {
      const { invoke } = await import('@tauri-apps/api/core')
      const { listen } = await import('@tauri-apps/api/event')
      let receivedEvent = false
      const stop = await listen<SystemEvent<ChannelData[C]>>(
        `system:${channel}`,
        (e) => {
          receivedEvent = true
          listener(e.payload)
        }
      )
      let token: string | undefined
      try {
        const subscription = await invoke<{
          token: string
          initial: SystemEvent<ChannelData[C]>
        }>('subscribe', {
          channel,
          intervalMs: options?.intervalMs
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

export const bridge: Bridge =
  typeof window !== 'undefined' && window.__TAURI_INTERNALS__
    ? createNativeBridge()
    : createMockBridge()

// Own asynchronous setup and teardown, including unmount before setup resolves.
export function connect<D extends Record<Channel, unknown>, C extends Channel>(
  adapter: Subscribable<D>,
  channel: C,
  options: SubscribeOptions,
  onValue: (event: SystemEvent<D[C]>) => void,
  onError: (error: unknown) => void
): () => void {
  let cancelled = false
  let dispose: (() => void) | undefined
  Promise.resolve()
    .then(() =>
      adapter.subscribe(
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
