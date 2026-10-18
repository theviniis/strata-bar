import type { MemoryData } from './memory.generated'
import { parseMemoryEvent } from './memory'
import type { CpuData } from './cpu.generated'
import { parseCpuEvent } from './cpu'
import type { GpuData } from './gpu.generated'
import { parseGpuEvent } from './gpu'

export type BridgeMode = 'demo' | 'native'

/** Channels the UI can subscribe to. The clock renders locally, without a channel. */
export type Channel =
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'network'
  | 'volume'
  | 'activeWindow'
  | 'komorebi'
  | 'audioOutputs'

export type WorkspaceStatus = 'active' | 'populated' | 'empty'

/** One komorebi workspace as projected for a single monitor. */
export interface KomorebiWorkspace {
  index: number
  name: string | null
  status: WorkspaceStatus
  layer: 'Tiling' | 'Floating'
  windows: number
}

/** Per-monitor komorebi snapshot. Indices are komorebi ring positions (zero-based). */
export interface KomorebiData {
  monitor: number
  floatOverride: boolean
  workspaces: KomorebiWorkspace[]
}

export type KomorebiAction =
  | { action: 'focusWorkspace'; monitor: number; workspace: number }
  | { action: 'cycleWorkspace'; direction: 'next' | 'previous' }

/** Payloads published by the native collectors. */
export interface ChannelData {
  cpu: CpuData
  memory: MemoryData
  gpu: GpuData
  network: number
  audioOutputs: {
    devices: { id: string; name: string }[]
    defaultDeviceId: string | null
  }
  volume: { level: number; muted: boolean }
  activeWindow: string
  komorebi: KomorebiData
}

/**
 * Illustrative values served by the browser demo adapter. Most are preview scalars
 * only, so they deliberately do not mirror the native payloads above; komorebi is
 * the exception because a workspace strip cannot be represented by a scalar.
 */
export interface DemoChannelData {
  cpu: number
  memory: number
  gpu: number
  network: number
  audioOutputs: null
  volume: number
  activeWindow: string
  komorebi: KomorebiData
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
  setAudioOutput?(value: {
    deviceId: string
  }): Promise<ChannelData['audioOutputs']>
  /** Only the native adapter owns the process, so the demo adapter cannot quit. */
  quit?(): Promise<void>
  /** Native-only: the studio demo cannot drive a real window manager. */
  komorebiAction?(value: KomorebiAction): Promise<void>
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
    gpu: 27,
    network: 128,
    volume: 64,
    audioOutputs: null,
    activeWindow: 'Visual Studio Code',
    komorebi: {
      monitor: 0,
      floatOverride: false,
      workspaces: [
        {
          index: 0,
          name: null,
          status: 'populated',
          layer: 'Tiling',
          windows: 2
        },
        {
          index: 1,
          name: 'web',
          status: 'active',
          layer: 'Tiling',
          windows: 1
        },
        { index: 2, name: null, status: 'empty', layer: 'Tiling', windows: 0 },
        { index: 3, name: null, status: 'empty', layer: 'Floating', windows: 0 }
      ]
    }
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
        if (channel === 'audioOutputs') {
          listener({ status: 'unavailable', data: null, timestamp: Date.now() })
        } else {
          listener({ status: 'ready', data, timestamp: Date.now() })
        }
      }
      emit()
      const timer = ['cpu', 'memory', 'gpu', 'network'].includes(channel)
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
      let listenChannel = listen
      if (channel === 'komorebi') {
        const { getCurrentWebviewWindow } =
          await import('@tauri-apps/api/webviewWindow')
        const currentWindow = getCurrentWebviewWindow()
        // Each bar must receive only its own per-monitor projection.
        listenChannel = currentWindow.listen.bind(currentWindow)
      }
      let receivedEvent = false
      let resourceSequence = -1
      const parsers = {
        cpu: parseCpuEvent,
        gpu: parseGpuEvent,
        memory: parseMemoryEvent
      } as const
      const deliver = (event: SystemEvent<ChannelData[C]>) => {
        // Resource payloads are validated before they reach a widget; each
        // subscription sees one channel, so the sequence guard is per channel.
        if (channel === 'cpu' || channel === 'gpu' || channel === 'memory') {
          const parsed = parsers[channel as keyof typeof parsers](event)
          if (parsed.status === 'ready') {
            if (parsed.data.sequence <= resourceSequence) return
            resourceSequence = parsed.data.sequence
          }
          listener(parsed as SystemEvent<ChannelData[C]>)
        } else listener(event)
      }
      const stop = await listenChannel<SystemEvent<ChannelData[C]>>(
        `system:${channel}`,
        (e) => {
          receivedEvent = true
          deliver(e.payload)
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
        if (!receivedEvent) deliver(subscription.initial)
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
    async setAudioOutput(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_audio_output', value)
    },
    async komorebiAction(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      const payload =
        value.action === 'focusWorkspace'
          ? {
              action: value.action,
              monitor: value.monitor,
              workspace: value.workspace,
              direction: null
            }
          : {
              action: value.action,
              monitor: null,
              workspace: null,
              direction: value.direction
            }
      return invoke('komorebi_action', payload)
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
