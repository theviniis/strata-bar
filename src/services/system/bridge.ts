import type { SettingsMonitor } from './config.generated'
import type { MediaData, MediaRequest, SpotifyStatus } from './media.generated'
import { demoMedia, mediaPosition, parseMediaEvent } from './media'
import type { MediaSpectrumData } from './media.generated'
import { demoSpectrum, spectrumEventGuard } from './media-spectrum'
import type { MemoryData } from './memory.generated'
import { parseMemoryEvent } from './memory'
import type { CpuData } from './cpu.generated'
import { parseCpuEvent } from './cpu'
import type { GpuData } from './gpu.generated'
import { parseGpuEvent } from './gpu'
import type { DiskData } from './disk.generated'
import { parseDiskEvent } from './disk'
import type { Config, ConfigSnapshot } from './config.generated'
import { parseSnapshot } from '@/services/configuration/config'

import type { WeatherCity, WeatherData } from './weather.generated'
import { parseWeatherEvent } from './weather'
import { weatherFixture } from '@/features/weather/fixtures'

export type BridgeMode = 'demo' | 'native'

/** Channels the UI can subscribe to. The clock renders locally, without a channel. */
export type Channel =
  | 'weather'
  | 'cpu'
  | 'memory'
  | 'gpu'
  | 'disk'
  | 'network'
  | 'volume'
  | 'activeWindow'
  | 'workspaces'
  | 'audioOutputs'
  | 'audioInputs'
  | 'microphone'
  | 'media'
  | 'mediaSpectrum'
  | 'voicemeeter'

export type WorkspaceStatus = 'active' | 'populated' | 'empty'

/** One workspace as projected for a single monitor. */
export interface Workspace {
  index: number
  name: string | null
  status: WorkspaceStatus
  layer: 'Tiling' | 'Floating'
  windows: number
}

/** Per-monitor workspaces snapshot. Indices are ring positions (zero-based). */
export interface WorkspacesData {
  monitor: number
  floatOverride: boolean
  workspaces: Workspace[]
}

export type WorkspacesAction =
  | { action: 'focusWorkspace'; monitor: number; workspace: number }
  | { action: 'cycleWorkspace'; direction: 'next' | 'previous' }

/** Payloads published by the native collectors. */
export interface ChannelData {
  mediaSpectrum: MediaSpectrumData
  weather: WeatherData
  media: MediaData
  cpu: CpuData
  memory: MemoryData
  gpu: GpuData
  disk: DiskData
  network: number
  audioOutputs: {
    devices: { id: string; name: string }[]
    defaultDeviceId: string | null
  }
  audioInputs: ChannelData['audioOutputs']
  microphone: ChannelData['volume']
  volume: { level: number; muted: boolean }
  activeWindow: string
  workspaces: WorkspacesData
  voicemeeter: VoicemeeterData
}

/**
 * Illustrative values served by the browser demo adapter. Most are preview scalars
 * only, so they deliberately do not mirror the native payloads above; workspaces and
 * disk are the exceptions because a workspace strip and a row of volume bars cannot
 * be represented by a scalar.
 */
export interface DemoChannelData {
  mediaSpectrum: MediaSpectrumData
  weather: WeatherData
  media: MediaData
  cpu: number
  memory: number
  gpu: number
  disk: DiskData
  network: number
  audioInputs: null
  microphone: number
  audioOutputs: null
  volume: number
  activeWindow: string
  workspaces: WorkspacesData
  voicemeeter: null
}

export type SystemStatus = 'loading' | 'ready' | 'unavailable' | 'error'

/** Native event envelope. The event name identifies the channel. */
export type SystemEvent<D = unknown> =
  | { status: 'loading'; data?: null; timestamp?: number }
  | { status: 'unavailable'; data?: null; timestamp?: number }
  | { status: 'ready'; data: D; timestamp?: number }
  | { status: 'error'; data?: null; error: string; timestamp?: number }

export interface SubscribeOptions {
  workspaceSource?: 'komorebi' | 'windows'
  intervalMs?: number
}

export type VolumeChange = { level?: number; muted?: boolean }

/** Voicemeeter destination forwarded to the native worker. */
export type VmTarget = { kind: 'strip' | 'bus'; index: number }
/** Channels whose snapshot can be published by the Voicemeeter engine. */
export type AudioChannel = 'volume' | 'microphone'

/** One strip/bus of the Voicemeeter engine as shown by the routing menu. */
export interface VoicemeeterIo {
  index: number
  /** Engine label: `A1`, `B1`, `Hardware 1`, `V1`... */
  slot: string
  /** `false` for the virtual VAIO strips/buses. */
  physical: boolean
  /** Assigned device or user label; empty when the engine reports none. */
  name: string
  gain: number
  mute: boolean
}

/** What the dedicated `voicemeeter` channel publishes for the routing menu. */
export interface VoicemeeterData {
  /** `VBVMR_GetVoicemeeterType`: 1 Voicemeeter, 2 Banana, 3 Potato. */
  application: number
  strips: VoicemeeterIo[]
  buses: VoicemeeterIo[]
}

export interface Subscribable<D extends Record<Channel, unknown>> {
  subscribe<C extends Channel>(
    channel: C,
    listener: (event: SystemEvent<D[C]>) => void,
    options?: SubscribeOptions
  ): Promise<() => void>
}

export interface AdapterBase {
  weatherSearch?(query: string): Promise<WeatherCity[]>
  settingsMonitors?(): Promise<SettingsMonitor[]>
  mediaAction?(request: MediaRequest): Promise<unknown>
  /** Native-only: the configuration file is the desktop runtime's, not the studio's. */
  configLoad?(): Promise<ConfigSnapshot>
  configSave?(config: Config): Promise<ConfigSnapshot>
  spotifyStatus?(): Promise<SpotifyStatus>
  spotifyConnect?(clientId: string): Promise<void>
  spotifyDisconnect?(): Promise<void>
  spotifyOpenDashboard?(): Promise<void>
  setMicrophone?(value: VolumeChange): Promise<ChannelData['microphone']>
  setAudioInput?(value: {
    deviceId: string
  }): Promise<ChannelData['audioInputs']>
  setVolume(value: VolumeChange): Promise<ChannelData['volume']>
  setAudioOutput?(value: {
    deviceId: string
  }): Promise<ChannelData['audioOutputs']>
  /** Native-only: routing a channel through Voicemeeter (`null` means Windows). */
  setChannelSource?(
    channel: AudioChannel,
    target: VmTarget | null
  ): Promise<void>
  /** Native-only: static feature gates per channel. */
  capabilities?(): Promise<Record<string, boolean>>
  /** Only the native adapter owns the process, so the demo adapter cannot quit. */
  quit?(): Promise<void>
  /** Native-only: the studio demo cannot drive a real window manager. */
  workspacesAction?(
    value: WorkspacesAction & { source?: 'komorebi' | 'windows' }
  ): Promise<void>
}

export interface DemoBridge extends AdapterBase, Subscribable<DemoChannelData> {
  mode: 'demo'
}

export interface NativeBridge extends AdapterBase, Subscribable<ChannelData> {
  mode: 'native'
}

export type Bridge = DemoBridge | NativeBridge

export function demoChannelData(): DemoChannelData {
  return {
    weather: weatherFixture(),
    mediaSpectrum: demoSpectrum(),
    media: demoMedia(),
    cpu: 17,
    memory: 46,
    gpu: 27,
    disk: {
      sequence: 1,
      sampledAt: Date.now(),
      volumes: [
        {
          mount: 'C:',
          label: 'System',
          kind: 'fixed',
          totalBytes: 512_000_000_000,
          freeBytes: 286_720_000_000,
          usedBytes: 225_280_000_000,
          percent: 44
        },
        {
          mount: 'D:',
          label: 'Data',
          kind: 'fixed',
          totalBytes: 1_000_000_000_000,
          freeBytes: 450_000_000_000,
          usedBytes: 550_000_000_000,
          percent: 55
        },
        // A mapped network drive: reported, but not part of "Dispositivos e unidades".
        {
          mount: 'Z:',
          label: 'Compartilhamento',
          kind: 'remote',
          totalBytes: 2_000_000_000_000,
          freeBytes: 1_000_000_000_000,
          usedBytes: 1_000_000_000_000,
          percent: 50
        }
      ]
    },
    network: 128,
    microphone: 72,
    audioInputs: null,
    volume: 64,
    audioOutputs: null,
    activeWindow: 'Visual Studio Code',
    voicemeeter: null,
    workspaces: {
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
}

export function createMockBridge(): DemoBridge {
  const mediaListeners = new Set<(event: SystemEvent<MediaData>) => void>()
  const values = demoChannelData()
  return {
    mode: 'demo',
    async subscribe<C extends Channel>(
      channel: C,
      listener: (event: SystemEvent<DemoChannelData[C]>) => void,
      { intervalMs = 2000 } = {}
    ) {
      const emit = () => {
        const data = values[channel]
        if (channel === 'audioOutputs' || channel === 'audioInputs') {
          listener({ status: 'unavailable', data: null, timestamp: Date.now() })
        } else {
          listener({ status: 'ready', data, timestamp: Date.now() })
        }
      }
      emit()
      if (channel === 'media') {
        const mediaListener = listener as (
          event: SystemEvent<MediaData>
        ) => void
        mediaListeners.add(mediaListener)
        return () => {
          mediaListeners.delete(mediaListener)
        }
      }
      const timer = ['cpu', 'memory', 'gpu', 'disk', 'network'].includes(
        channel
      )
        ? setInterval(emit, intervalMs)
        : undefined
      return () => clearInterval(timer)
    },
    async mediaAction(request) {
      const data = {
        ...values.media,
        progress: { ...values.media.progress },
        volume: { ...values.media.volume },
        shuffle: { ...values.media.shuffle },
        repeat: { ...values.media.repeat }
      }
      if (
        request.sessionId !== data.sessionId ||
        request.trackId !== data.trackId
      )
        throw new Error('Demo media changed')
      const action = request.action
      if (action.action === 'playPause') {
        if (data.progress.value)
          data.progress.value = {
            ...data.progress.value,
            positionMs: mediaPosition(data.progress.value),
            measuredAt: Date.now(),
            rate: data.playback === 'playing' ? 0 : 1
          }
        data.playback = data.playback === 'playing' ? 'paused' : 'playing'
      } else if (action.action === 'next' || action.action === 'previous') {
        data.title = data.title === 'Dragonaut' ? 'The Druid' : 'Dragonaut'
        data.trackId =
          data.trackId === 'demo-track-1' ? 'demo-track-2' : 'demo-track-1'
      } else if (action.action === 'seek' && data.progress.value) {
        if (
          !Number.isFinite(action.positionMs) ||
          action.positionMs < 0 ||
          action.positionMs > data.progress.value.durationMs
        )
          throw new Error('Invalid demo seek')
        data.progress.value = {
          ...data.progress.value,
          positionMs: action.positionMs,
          measuredAt: Date.now()
        }
      } else if (action.action === 'volume' && data.volume.value) {
        if (
          !Number.isFinite(action.level) ||
          action.level < 0 ||
          action.level > 100
        )
          throw new Error('Invalid demo volume')
        data.volume.value = { ...data.volume.value, level: action.level }
      } else if (action.action === 'mute' && data.volume.value)
        data.volume.value = { ...data.volume.value, muted: action.muted }
      else if (action.action === 'shuffle') data.shuffle.value = action.active
      else if (action.action === 'repeat') data.repeat.value = action.mode
      else throw new Error('Demo action unsupported')
      values.media = { ...data }
      for (const listener of mediaListeners)
        listener({ status: 'ready', data: values.media })
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
      if (channel === 'workspaces') {
        const { getCurrentWebviewWindow } =
          await import('@tauri-apps/api/webviewWindow')
        const currentWindow = getCurrentWebviewWindow()
        // Each bar must receive only its own per-monitor projection.
        listenChannel = currentWindow.listen.bind(currentWindow)
      }
      let receivedEvent = false
      let resourceSequence = -1
      const spectrumGuard = spectrumEventGuard()
      const parsers = {
        cpu: parseCpuEvent,
        gpu: parseGpuEvent,
        memory: parseMemoryEvent,
        disk: parseDiskEvent
      } as const
      const deliver = (event: SystemEvent<ChannelData[C]>) => {
        // Resource payloads are validated before they reach a widget; each
        // subscription sees one channel, so the sequence guard is per channel.
        if (
          channel === 'cpu' ||
          channel === 'gpu' ||
          channel === 'memory' ||
          channel === 'disk'
        ) {
          const parsed = parsers[channel as keyof typeof parsers](event)
          if (parsed.status === 'ready') {
            if (parsed.data.sequence <= resourceSequence) return
            resourceSequence = parsed.data.sequence
          }
          listener(parsed as SystemEvent<ChannelData[C]>)
        } else if (channel === 'mediaSpectrum') {
          const parsed = spectrumGuard(event)
          if (parsed) listener(parsed as SystemEvent<ChannelData[C]>)
        } else if (channel === 'media')
          listener(parseMediaEvent(event) as SystemEvent<ChannelData[C]>)
        else if (channel === 'weather')
          listener(parseWeatherEvent(event) as SystemEvent<ChannelData[C]>)
        else listener(event)
      }
      const stop = await listenChannel<SystemEvent<ChannelData[C]>>(
        `system:${channel}${channel === 'workspaces' && options?.workspaceSource !== 'komorebi' ? ':windows' : ''}`,
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
          ...(channel === 'workspaces'
            ? { workspaceSource: options?.workspaceSource ?? 'windows' }
            : {}),
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
    async mediaAction(request) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('media_action', { request })
    },
    async weatherSearch(query) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<WeatherCity[]>('weather_search', { query })
    },
    async settingsMonitors() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<SettingsMonitor[]>('settings_monitors')
    },
    async configLoad() {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseSnapshot(await invoke<ConfigSnapshot>('config_load'))
    },
    async configSave(config) {
      const { invoke } = await import('@tauri-apps/api/core')
      return parseSnapshot(
        await invoke<ConfigSnapshot>('config_save', { config })
      )
    },
    async spotifyStatus() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<SpotifyStatus>('spotify_status')
    },
    async spotifyConnect(clientId) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('spotify_connect', { clientId })
    },
    async spotifyDisconnect() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('spotify_disconnect')
    },
    async spotifyOpenDashboard() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('spotify_open_dashboard')
    },
    async setVolume(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_volume', value)
    },
    async setChannelSource(channel, target) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_channel_source', { channel, target })
    },
    async capabilities() {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke<Record<string, boolean>>('capabilities')
    },
    async setMicrophone(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_microphone', value)
    },
    async setAudioInput(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_audio_input', value)
    },
    async setAudioOutput(value) {
      const { invoke } = await import('@tauri-apps/api/core')
      return invoke('set_audio_output', value)
    },
    async workspacesAction(value) {
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
      return invoke('workspaces_action', {
        ...payload,
        source: value.source ?? 'windows'
      })
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
