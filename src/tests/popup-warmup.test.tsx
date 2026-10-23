import { act, render, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { definePopup, lazyContent } from '../popups/definition'
import { warmPopupContents } from '../popups/warmup'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('shares concurrent preloads with rendering without mounting during preload', async () => {
  const mount = vi.fn()
  const load = vi.fn(async () => ({
    Content: () => {
      mount()
      return <p>Loaded popup</p>
    }
  }))
  const Content = lazyContent(load, 'Content')
  expect(Content.preload()).toBe(Content.preload())
  await Content.preload()
  expect(load).toHaveBeenCalledOnce()
  expect(mount).not.toHaveBeenCalled()
  render(<Content />)
  expect(screen.getByText('Loaded popup')).toBeInTheDocument()
  expect(load).toHaveBeenCalledOnce()
})

it('deduplicates imports when warmup is restarted during an import', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  let release!: () => void
  const load = vi.fn(
    () =>
      new Promise<{ Content: () => null }>((resolve) => {
        release = () => resolve({ Content: () => null })
      })
  )
  const Content = lazyContent(load, 'Content')
  const stop = warmPopupContents([{ Content }])
  await vi.advanceTimersByTimeAsync(100)
  stop()
  warmPopupContents([{ Content }])
  await vi.advanceTimersByTimeAsync(100)
  expect(load).toHaveBeenCalledOnce()
  release()
  await vi.runAllTimersAsync()
})

it('retries a failed preload when opened', async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue({ Content: () => <p>Recovered</p> })
  const Content = lazyContent(load, 'Content')
  await expect(Content.preload()).rejects.toThrow('offline')
  await act(async () => {
    render(
      <Suspense fallback="Loading">
        <Content />
      </Suspense>
    )
  })
  expect(screen.getByText('Recovered')).toBeInTheDocument()
  expect(load).toHaveBeenCalledTimes(2)
})

it('warms sequentially, skips plain contents and continues after failures', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  let release!: () => void
  const first = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  )
  const failed = vi.fn(async () => {
    throw new Error('offline')
  })
  const last = vi.fn(async () => {})
  warmPopupContents([
    { Content: { preload: first } },
    definePopup({ label: 'Plain', Content: () => null }),
    { Content: { preload: failed } },
    { Content: { preload: last } }
  ])
  await vi.advanceTimersByTimeAsync(500)
  expect(first).toHaveBeenCalledOnce()
  expect(last).not.toHaveBeenCalled()
  release()
  await vi.runAllTimersAsync()
  expect(failed).toHaveBeenCalledOnce()
  expect(last).toHaveBeenCalledOnce()
})

it('cancels pending idle work and uses the one second idle timeout', () => {
  const cancel = vi.fn()
  const idle = vi.fn(() => 7)
  vi.stubGlobal('requestIdleCallback', idle)
  vi.stubGlobal('cancelIdleCallback', cancel)
  const load = vi.fn()
  const stop = warmPopupContents([{ Content: { preload: load } }])
  expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 1000 })
  stop()
  expect(cancel).toHaveBeenCalledWith(7)
  expect(load).not.toHaveBeenCalled()
})

it('cancels fallback work and stops the queue after an in-flight import', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('requestIdleCallback', undefined)
  const load = vi.fn(async () => {})
  const stop = warmPopupContents([{ Content: { preload: load } }])
  stop()
  await vi.runAllTimersAsync()
  expect(load).not.toHaveBeenCalled()
  let release!: () => void
  const first = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  )
  const stopInFlight = warmPopupContents([
    { Content: { preload: first } },
    { Content: { preload: load } }
  ])
  await vi.advanceTimersByTimeAsync(100)
  stopInFlight()
  release()
  await vi.runAllTimersAsync()
  expect(first).toHaveBeenCalledOnce()
  expect(load).not.toHaveBeenCalled()
})
