import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const host = vi.hoisted(() => ({
  show: vi.fn(),
  hide: vi.fn(),
  bounce: vi.fn(),
  closed: null as
    null | ((event: { payload: { session: string; docked?: boolean } }) => void)
}))
vi.mock('../services/system/overlay', () => ({
  overlay: { mode: 'native', show: host.show, hide: host.hide }
}))
vi.mock('../popups/motion', () => ({ bouncePopupAnchor: host.bounce }))
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (_name: string, handler: typeof host.closed) => {
    host.closed = handler
    return () => {
      host.closed = null
    }
  }
}))
import { useOverlayPopover } from '../hooks/use-overlay-popover'
function Trigger() {
  const { triggerRef, open, toggle } = useOverlayPopover('audioOutputs')
  return (
    <div data-overlay-anchor>
      <button
        ref={triggerRef}
        aria-expanded={open}
        onClick={() => void toggle()}
      >
        Outputs
      </button>
    </div>
  )
}
beforeEach(() => {
  host.show.mockResolvedValue(undefined)
  host.hide.mockResolvedValue(undefined)
  vi.clearAllMocks()
})
it('opens a typed popup, closes on a second click and ignores another owner closing', async () => {
  render(<Trigger />)
  vi.spyOn(
    screen.getByRole('button').parentElement!,
    'getBoundingClientRect'
  ).mockReturnValue(new DOMRect(100, 0, 80, 36))
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  const request = host.show.mock.calls[0][0]
  expect(request).toMatchObject({
    kind: 'popover',
    component: 'audioOutputs',
    anchor: { x: 100, y: 0, width: 80, height: 36 },
    size: { width: 1, height: 1 }
  })
  act(() => host.closed!({ payload: { session: 'another-owner' } }))
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  )
  expect(host.hide).toHaveBeenCalledWith(request.session)
})
it('closes on Escape and outside pointer input', async () => {
  render(<Trigger />)
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() =>
    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
  )
  fireEvent.pointerDown(document.body)
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
})

it('bounces only after the matching closing session docks, including a bar-initiated close', async () => {
  render(<Trigger />)
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(host.show).toHaveBeenCalledOnce())
  const session = host.show.mock.calls[0][0].session
  fireEvent.keyDown(window, { key: 'Escape' })
  // Repeated dismissal must not lose the session awaiting docking.
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(host.bounce).not.toHaveBeenCalled()
  act(() => host.closed!({ payload: { session: 'stale', docked: true } }))
  expect(host.bounce).not.toHaveBeenCalled()
  act(() => host.closed!({ payload: { session, docked: true } }))
  expect(host.bounce).toHaveBeenCalledOnce()
  act(() => host.closed!({ payload: { session, docked: true } }))
  expect(host.bounce).toHaveBeenCalledOnce()
})

it('does not bounce on forced cleanup or when a newer popup has opened', async () => {
  render(<Trigger />)
  await waitFor(() => expect(host.closed).not.toBeNull())
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(host.show).toHaveBeenCalledOnce())
  const session = host.show.mock.calls[0][0].session
  act(() => host.closed!({ payload: { session, docked: false } }))
  expect(host.bounce).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(host.show).toHaveBeenCalledTimes(2))
  act(() => host.closed!({ payload: { session, docked: true } }))
  expect(host.bounce).not.toHaveBeenCalled()
  expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true')
})
