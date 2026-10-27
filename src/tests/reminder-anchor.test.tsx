import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useReminderAnchor } from '@/features/reminders/src/use-reminder-anchor'
import { Reminders } from '@/features/reminders/widget/reminders.widget'

const transport = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  stop: vi.fn()
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: transport.invoke }))
vi.mock('@tauri-apps/api/event', () => ({ listen: transport.listen }))

function Anchor() {
  const ref = useReminderAnchor()
  return (
    <Reminders
      ref={ref}
      next={null}
      now={0}
      ringing={false}
      error={null}
      format="label"
    />
  )
}

beforeEach(() => {
  transport.invoke.mockReset().mockResolvedValue(undefined)
  transport.stop.mockReset()
  transport.listen.mockReset().mockResolvedValue(transport.stop)
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(100, 4, 32, 28)
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('reports the real rectangle and remeasures for a native expiry occurrence', async () => {
  const view = render(<Anchor />)
  await waitFor(() =>
    expect(transport.invoke).toHaveBeenCalledWith('reminders_set_anchor', {
      anchor: { x: 100, y: 4, width: 32, height: 28 },
      occurrence: null
    })
  )
  const onRequest = transport.listen.mock.calls[0][1]
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue(
    new DOMRect(240, 4, 24, 28)
  )
  await act(async () => onRequest({ payload: 'reminder:12345' }))
  await waitFor(() =>
    expect(transport.invoke).toHaveBeenLastCalledWith('reminders_set_anchor', {
      anchor: { x: 240, y: 4, width: 24, height: 28 },
      occurrence: 'reminder:12345'
    })
  )
  view.unmount()
  expect(transport.stop).toHaveBeenCalledOnce()
  transport.invoke.mockClear()
  await act(async () => onRequest({ payload: 'reminder:67890' }))
  expect(transport.invoke).not.toHaveBeenCalled()
})

it('does not report demo rectangles to the native host', async () => {
  vi.stubGlobal('__TAURI_INTERNALS__', undefined)
  render(<Anchor />)
  await act(async () => {})
  expect(transport.listen).not.toHaveBeenCalled()
  expect(transport.invoke).not.toHaveBeenCalled()
})
