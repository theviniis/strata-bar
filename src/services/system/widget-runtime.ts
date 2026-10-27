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

export const liveWidgetRuntime: WidgetRuntime = {
  interactive: true,
  animated: true,
  now: () => Date.now(),
  initial: () => ({ status: 'loading', data: null }),
  subscribe: (channel, options, listener, onError) =>
    connect<ChannelData, typeof channel>(
      bridge as NativeBridge,
      channel,
      options,
      listener,
      onError
    ),
  observeTime(listener, cadence) {
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      listener(Date.now())
      timer = setTimeout(
        tick,
        cadence === 'minute' ? 60000 - (Date.now() % 60000) : cadence
      )
    }
    tick()
    return () => clearTimeout(timer)
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
