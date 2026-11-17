import { afterEach, expect, it, vi } from 'vitest'
import {
  liveWidgetRuntime,
  previewWidgetRuntime
} from '@/services/system/widget-runtime'
import { PREVIEW_TIME } from '@/services/system/widget-preview'
import { bridge } from '@/services/system/bridge'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it.each([
  { cadence: 'minute', delay: 15_000 },
  { cadence: 1000, delay: 1000 }
] as const)(
  'publishes live time at $cadence cadence and stops on disposal',
  ({ cadence, delay }) => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 27, 9, 41, 45))
    const listener = vi.fn()
    const stop = liveWidgetRuntime.observeTime(listener, cadence)
    expect(listener).toHaveBeenCalledWith(Date.now())
    vi.advanceTimersByTime(delay - 1)
    expect(listener).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(Date.now())
    stop()
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(120_000)
    expect(listener).toHaveBeenCalledTimes(2)
  }
)

it('keeps preview time fixed and never starts a subscription, clock or effect', () => {
  vi.useFakeTimers()
  const listener = vi.fn()
  const effect = vi.fn()
  const stopChannel = previewWidgetRuntime.subscribe(
    'cpu',
    {},
    listener,
    effect
  )
  const stopTime = previewWidgetRuntime.observeTime(listener, 'minute')
  previewWidgetRuntime.effect(effect)
  vi.advanceTimersByTime(120_000)
  expect(previewWidgetRuntime.now()).toBe(PREVIEW_TIME)
  expect(previewWidgetRuntime.initial('cpu').status).toBe('ready')
  expect(listener).not.toHaveBeenCalled()
  expect(effect).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
  stopChannel()
  stopTime()
})

it('shares a cadence across consumers and only stops after the last disposal', () => {
  vi.useFakeTimers()
  const first = vi.fn()
  const second = vi.fn()
  const stopFirst = liveWidgetRuntime.observeTime(first, 1000)
  const stopSecond = liveWidgetRuntime.observeTime(second, 1000)
  expect(vi.getTimerCount()).toBe(1)
  stopFirst()
  stopFirst()
  vi.advanceTimersByTime(1000)
  expect(first).toHaveBeenCalledTimes(1)
  expect(second).toHaveBeenCalledTimes(2)
  stopSecond()
  expect(vi.getTimerCount()).toBe(0)
})

it('shares compatible subscriptions and cancels pending setup after the final consumer leaves', async () => {
  const dispose = vi.fn()
  let resolve: (dispose: () => void) => void = () => {}
  const subscribe = vi.spyOn(bridge, 'subscribe').mockReturnValue(
    new Promise((done) => {
      resolve = done
    })
  )
  const first = liveWidgetRuntime.subscribe(
    'cpu',
    { intervalMs: 2000 },
    vi.fn(),
    vi.fn()
  )
  const second = liveWidgetRuntime.subscribe(
    'cpu',
    { intervalMs: 2000 },
    vi.fn(),
    vi.fn()
  )
  await Promise.resolve()
  expect(subscribe).toHaveBeenCalledTimes(1)
  first()
  first()
  expect(dispose).not.toHaveBeenCalled()
  second()
  resolve(dispose)
  await new Promise((done) => setTimeout(done, 0))
  expect(dispose).toHaveBeenCalledTimes(1)
})

it('keeps different cadences and workspace sources independent', async () => {
  const dispose = vi.fn()
  const subscribe = vi.spyOn(bridge, 'subscribe').mockResolvedValue(dispose)
  const stops = [
    liveWidgetRuntime.subscribe('cpu', { intervalMs: 1000 }, vi.fn(), vi.fn()),
    liveWidgetRuntime.subscribe('cpu', { intervalMs: 2000 }, vi.fn(), vi.fn()),
    liveWidgetRuntime.subscribe(
      'workspaces',
      { workspaceSource: 'windows' },
      vi.fn(),
      vi.fn()
    ),
    liveWidgetRuntime.subscribe(
      'workspaces',
      { workspaceSource: 'komorebi' },
      vi.fn(),
      vi.fn()
    )
  ]
  await new Promise((done) => setTimeout(done, 0))
  expect(subscribe).toHaveBeenCalledTimes(4)
  stops.forEach((stop) => stop())
  await Promise.resolve()
  expect(dispose).toHaveBeenCalledTimes(4)
})
