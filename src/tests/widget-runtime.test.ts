import { afterEach, expect, it, vi } from 'vitest'
import {
  liveWidgetRuntime,
  previewWidgetRuntime
} from '@/services/system/widget-runtime'
import { PREVIEW_TIME } from '@/services/system/widget-preview'

afterEach(() => vi.useRealTimers())

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
