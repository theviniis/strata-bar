import {
  bridge,
  connect,
  type Channel,
  type ChannelData,
  type NativeBridge,
  type SubscribeOptions,
  type SystemEvent
} from './bridge'
import { PREVIEW_TIME, widgetPreviewEvent } from './widget-preview'

type Cleanup = () => void
type Effect = () => void | Cleanup

/** Data, time and effect policy shared by widgets; preview is selected explicitly. */
export type WidgetRuntime = {
  interactive: boolean
  animated: boolean
  now(): number
  initial<C extends Channel>(channel: C): SystemEvent<ChannelData[C]>
  subscribe<C extends Channel>(
    channel: C,
    options: SubscribeOptions,
    listener: (event: SystemEvent<ChannelData[C]>) => void,
    onError: (error: unknown) => void
  ): Cleanup
  observeTime(
    listener: (now: number) => void,
    cadence: number | 'minute'
  ): Cleanup
  effect: (effect: Effect) => void | Cleanup
}

const noop = () => {}

// Document-local retention; never an alternative source of native data.
// Open preparation refreshes this from the native subscription snapshot before
// mounting. Expiry prevents an idle host presenting old values as current.
const retained = new Map<Channel, { event: SystemEvent<unknown>; at: number }>()
export function retainChannel<C extends Channel>(
  channel: C,
  event: SystemEvent<ChannelData[C]>
) {
  // Workspace projections depend on a bar's monitor and configured source.
  if (channel !== 'workspaces') retained.set(channel, { event, at: Date.now() })
}

type Consumer = {
  value(event: SystemEvent<unknown>): void
  error(error: unknown): void
}
type SharedChannel = {
  consumers: Set<Consumer>
  latest?: SystemEvent<unknown>
  stop: Cleanup
}
// A document has its own monitor projection. Only identical subscription
// options share a transport; changing cadence/source never borrows another's.
const subscriptions = new Map<string, SharedChannel>()
function subscribe<C extends Channel>(
  channel: C,
  options: SubscribeOptions,
  listener: (event: SystemEvent<ChannelData[C]>) => void,
  onError: (error: unknown) => void
): Cleanup {
  const normalized = { ...options, intervalMs: options.intervalMs ?? 2000 }
  // Audio and other interaction channels can resubscribe to confirm changes
  // in routing or ownership. Share only read-only observation streams here.
  if (
    channel !== 'cpu' &&
    channel !== 'gpu' &&
    channel !== 'memory' &&
    channel !== 'disk' &&
    channel !== 'network' &&
    channel !== 'mediaSpectrum'
  ) {
    return connect<ChannelData, C>(
      bridge as NativeBridge,
      channel,
      normalized,
      (event) => {
        retainChannel(channel, event)
        listener(event)
      },
      onError
    )
  }
  const key = JSON.stringify([channel, normalized.intervalMs])
  const consumer: Consumer = {
    // The key includes the channel; the bridge validates its payload before
    // dispatch. Erasure is confined to this heterogeneous document-local map.
    value: (event) => listener(event as SystemEvent<ChannelData[C]>),
    error: onError
  }
  let entry = subscriptions.get(key)
  if (entry) {
    entry.consumers.add(consumer)
    if (entry.latest) consumer.value(entry.latest)
  } else {
    const created: SharedChannel = {
      consumers: new Set([consumer]),
      stop: noop
    }
    entry = created
    subscriptions.set(key, created)
    created.stop = connect<ChannelData, C>(
      bridge as NativeBridge,
      channel,
      normalized,
      (event) => {
        retainChannel(channel, event)
        created.latest = event
        for (const consumer of created.consumers) consumer.value(event)
      },
      (error) => {
        // A retry must start a new connection, not join a failed setup.
        if (subscriptions.get(key) === created) subscriptions.delete(key)
        for (const consumer of created.consumers) consumer.error(error)
      }
    )
  }
  return () => {
    if (!entry.consumers.delete(consumer) || entry.consumers.size) return
    if (subscriptions.get(key) === entry) subscriptions.delete(key)
    entry.stop()
  }
}

type Clock = {
  listeners: Set<(now: number) => void>
  timer?: ReturnType<typeof setTimeout>
}
const clocks = new Map<number | 'minute', Clock>()

export const liveWidgetRuntime: WidgetRuntime = {
  interactive: true,
  animated: true,
  now: () => Date.now(),
  initial: <C extends Channel>(channel: C): SystemEvent<ChannelData[C]> => {
    const value = retained.get(channel)
    return value && Date.now() >= value.at && Date.now() - value.at < 5000
      ? (value.event as SystemEvent<ChannelData[C]>)
      : { status: 'loading', data: null }
  },
  subscribe,
  observeTime(listener, cadence) {
    let clock = clocks.get(cadence)
    if (!clock) {
      const created: Clock = { listeners: new Set() }
      clock = created
      clocks.set(cadence, created)
      const schedule = () => {
        created.timer = setTimeout(
          () => {
            const now = Date.now()
            for (const callback of created.listeners) callback(now)
            if (clocks.get(cadence) === created) schedule()
          },
          cadence === 'minute' ? 60000 - (Date.now() % 60000) : cadence
        )
      }
      schedule()
    }
    const callback = (now: number) => listener(now)
    clock.listeners.add(callback)
    listener(Date.now())
    return () => {
      if (!clock.listeners.delete(callback) || clock.listeners.size) return
      clearTimeout(clock.timer)
      clocks.delete(cadence)
    }
  },
  effect: (effect) => effect()
}

export const previewWidgetRuntime: WidgetRuntime = {
  interactive: false,
  animated: false,
  now: () => PREVIEW_TIME,
  initial: widgetPreviewEvent,
  subscribe: () => noop,
  observeTime: () => noop,
  effect: noop
}
